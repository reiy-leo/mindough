/**
 * 在地图上选点（Rei 2026-11-10）：餐厅、目的地的资料编辑里打开，点地图或拖标记选位置，
 * 停下来后经 Worker 逆地理（/api/lookup/regeo）显示地址；「用这个位置」把经纬度填回去，地址、城市 / 区原来空着才填，
 * 勾上「地址也换成这个」才覆盖。JS API 按需加载、安全密钥走 Worker 代理，见 lib/amap.ts。
 */
import { useEffect, useRef, useState } from 'react';
import { Checkbox } from 'react-aria-components';
import { Check, MapPin } from 'lucide-react';
import { parseLngLat, type MapPick } from '@mindough/core';
import { DEFAULT_CENTER, RegeoError, fetchAmapConfig, loadAMap, regeo, type AMapMap, type AMapMarker, type RegeoResult } from '../../lib/amap';
import { statusZh } from '../../lib/account';
import { useLookupAvailable } from '../../lib/lookup';
import { Button } from '../../ui/primitives';
import { tr } from '../../lib/i18n';

type Phase = { at: 'checking' } | { at: 'unconfigured' } | { at: 'failed'; text: string } | { at: 'ready' };

export interface MapPickerProps {
  /** 资料里现在的经纬度、地址（「121.48,31.23」）。 */
  location: string | null;
  address: string;
  onCancel: () => void;
  onPick: (pick: MapPick, replaceAddress: boolean) => void;
  /** 测试用：替换加载与请求。 */
  deps?: { config?: typeof fetchAmapConfig; load?: typeof loadAMap; regeo?: typeof regeo };
}

export function MapPicker({ location, address, onCancel, onPick, deps = {} }: MapPickerProps) {
  const online = useLookupAvailable();
  const [phase, setPhase] = useState<Phase>({ at: 'checking' });
  const [point, setPoint] = useState<{ lng: number; lat: number } | null>(() => parseLngLat(location));
  const [geo, setGeo] = useState<{ status: 'idle' | 'loading' | 'done' | 'error'; r?: RegeoResult; text?: string }>({ status: 'idle' });
  const [replace, setReplace] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const markerRef = useRef<AMapMarker | null>(null);

  // 1. 先问 Worker 配没配安全密钥，再加载 JS API、建地图
  useEffect(() => {
    if (!online) return;
    let dead = false;
    (async () => {
      try {
        const cfg = await (deps.config ?? fetchAmapConfig)();
        if (dead) return;
        if (!cfg.js) return setPhase({ at: 'unconfigured' });
        const AMap = await (deps.load ?? loadAMap)();
        if (dead || !box.current) return;
        const start = parseLngLat(location);
        const center: [number, number] = start ? [start.lng, start.lat] : DEFAULT_CENTER;
        const map = new AMap.Map(box.current, { zoom: start ? 16 : 11, center, resizeEnable: true });
        const marker = new AMap.Marker({ position: center, draggable: true, map });
        mapRef.current = map;
        markerRef.current = marker;
        const move = (lng: number, lat: number) => setPoint({ lng, lat });
        marker.on('dragend', () => {
          const p = marker.getPosition();
          move(p.getLng(), p.getLat());
        });
        map.on('click', (e) => {
          marker.setPosition([e.lnglat.getLng(), e.lnglat.getLat()]);
          move(e.lnglat.getLng(), e.lnglat.getLat());
        });
        if (!start) move(center[0], center[1]);
        setPhase({ at: 'ready' });
      } catch {
        if (!dead) setPhase({ at: 'failed', text: tr('高德地图加载不出来，检查一下网络再试') });
      }
    })();
    return () => {
      dead = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [online]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. 点停下 400 毫秒后逆地理
  useEffect(() => {
    if (!point || phase.at !== 'ready') return;
    const ctrl = new AbortController();
    setGeo((g) => ({ ...g, status: 'loading' }));
    const t = setTimeout(() => {
      (deps.regeo ?? regeo)(point.lng, point.lat, ctrl.signal).then(
        (r) => setGeo({ status: 'done', r }),
        (e: unknown) => {
          if (ctrl.signal.aborted) return;
          const code = e instanceof RegeoError ? e.status : 0;
          const text = e instanceof RegeoError && e.state === 'unconfigured' ? tr('{source} 还没配置', { source: tr('高德地图') }) : tr('地址暂时取不到（{status}）', { status: code ? `${code} ${statusZh(code)}`.trim() : tr('连不上') });
          setGeo({ status: 'error', text });
        },
      );
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [point, phase.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const r = geo.status === 'done' ? geo.r : undefined;
  const differs = !!r?.address && !!address.trim() && r.address !== address.trim();
  const pick = () => {
    if (!point) return;
    onPick({ lng: point.lng, lat: point.lat, ...(r?.address ? { address: r.address } : {}), ...(r?.city ? { city: r.city } : {}) }, differs && replace);
  };

  let note: string | null = null;
  if (!online) note = tr('登录后才能在线找，到设置里登录');
  else if (phase.at === 'checking') note = tr('正在打开地图…');
  else if (phase.at === 'unconfigured') note = tr('高德地图还没配置，选不了点');
  else if (phase.at === 'failed') note = phase.text;

  return (
    <section className="map-picker" aria-label={tr('在地图上选点')}>
      <div className="map-picker-head">{tr('点地图或拖动标记，选好位置')}</div>
      <div className="map-picker-stage">
        {/* 地图自己管这个 div 里的东西，React 不往里放子元素 */}
        <div className={`map-picker-canvas${phase.at === 'ready' ? ' is-ready' : ''}`} ref={box} data-testid="map-canvas" />
        {note && <div className="map-picker-note">{note}</div>}
      </div>
      {phase.at === 'ready' && point && (
        <div className="map-picker-info" aria-live="polite">
          <MapPin size={14} aria-hidden />
          <div className="map-picker-text">
            <div className="map-picker-addr">{geo.status === 'loading' ? tr('正在找地址…') : geo.status === 'error' ? geo.text : r?.address || tr('这里没有地址')}</div>
            <div className="map-picker-sub">
              {[r?.pois[0] ? tr('附近：{name}', { name: r.pois[0].name }) : '', `${point.lng.toFixed(6)}, ${point.lat.toFixed(6)}`].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      )}
      {differs && (
        <Checkbox className="autofill-row map-picker-replace" isSelected={replace} onChange={setReplace}>
          <span className="autofill-check" aria-hidden>
            {replace && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="autofill-label">{tr('地址也换成这个')}</span>
          <span className="autofill-values">
            <span className="autofill-old">{tr('现在：{v}', { v: address.trim() })}</span>
          </span>
        </Checkbox>
      )}
      <div className="autofill-actions">
        <span className="grow" />
        <Button variant="secondary" onPress={onCancel}>
          {tr('取消')}
        </Button>
        <Button variant="primary" isDisabled={phase.at !== 'ready' || !point} onPress={pick}>
          {tr('用这个位置')}
        </Button>
      </div>
    </section>
  );
}
