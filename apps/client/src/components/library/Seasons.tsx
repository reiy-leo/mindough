/**
 * 资料页的「季」（Rei 2026-11-11「影视库里的剧集显示 seasons」）：剧集按 TMDB 列出各季——
 * 海报小图、第 N 季（特别篇放最后）、首播年份、集数，下面是这一季的豆瓣、IMDb 小链接（Rei 2026-11-21）。只显示，不记每季看到哪；电影不显示。
 * 数据存在资料的 `_seasons` 里（core/seasons.ts），缺了由 lib/seasons.ts 在后台补拉一次。
 * 标题旁的刷新按钮（Rei 2026-11-22）：TMDB 后来补了季，点一下整份重拉；拉的时候图标转圈、按钮禁用，失败弹提示、不动旧的。
 * 拉过但 TMDB 上一季都没有、或者还没拉到时，也显示这一节（只有标题、刷新按钮和一行说明），好让人手动再拉。
 */
import { useState, type CSSProperties } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { RefreshCw } from 'lucide-react';
import { hasStoredSeasons, placeholderArt, seasonLinks, seasonMeta, seasonPosterUrl, seasonsOf, seasonsRef, seasonSubtitle, seasonTitle, readSeasons, sourceOfFields, type LibraryItem, type SeasonInfo, type Store, type TaskType } from '@mindough/core';
import { Section, Tip } from '../../ui/primitives';
import { useUi } from '../../lib/ui';
import { refreshSeasonsNow, seasonsRefreshMessage, useSeasonsBusy, useSeasonsRefresh } from '../../lib/seasons';
import { useDoubanSeasonsRefresh } from '../../lib/douban-seasons';
import { ExtLink } from './LinkFields';
import { tr } from '../../lib/i18n';

function SeasonPoster({ s, label }: { s: SeasonInfo; label: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : seasonPosterUrl(s.poster);
  const art = placeholderArt(label);
  return (
    <span className={`art art-poster season-art${src ? ' has-image' : ''}`} style={{ '--art-from': art.from, '--art-to': art.to } as CSSProperties} aria-hidden>
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="art-initials">{s.number === 0 ? 'SP' : `S${s.number}`}</span>
      )}
    </span>
  );
}

/** 这一季的豆瓣、IMDb 链接（Rei 2026-11-21）：小标签，跟资料的链接标签一个样子，只是更小、不带箭头。 */
function SeasonLinks({ item, s, title }: { item: LibraryItem; s: SeasonInfo; title: string }) {
  const links = seasonLinks(item, s);
  if (!links.douban && !links.imdb) return null;
  return (
    <span className="season-links">
      {links.douban && (
        <ExtLink href={links.douban} className="link-chip season-link" label={tr('在 {label} 打开{title}', { label: tr('豆瓣'), title })}>
          {tr('豆瓣')}
        </ExtLink>
      )}
      {links.imdb && (
        <ExtLink href={links.imdb} className="link-chip season-link" label={tr('在 {label} 打开{title}', { label: 'IMDb', title })}>
          IMDb
        </ExtLink>
      )}
    </span>
  );
}

/** 「季」标题旁的刷新按钮：Lucide refresh-cw，拉的时候转圈、禁用。 */
function SeasonsRefreshButton({ store, type, item }: { store: Store; type: TaskType; item: LibraryItem }) {
  const busy = useSeasonsBusy(item.id);
  const { toast } = useUi();
  const label = busy ? tr('正在刷新季…') : tr('刷新季');
  return (
    <Tip content={label}>
      <RacButton
        className="icon-btn season-refresh"
        aria-label={label}
        aria-busy={busy || undefined}
        isDisabled={busy}
        onPress={async () => {
          const msg = seasonsRefreshMessage(await refreshSeasonsNow(store, type, item.id));
          if (msg) toast(msg);
        }}
      >
        <RefreshCw size={16} className={busy ? 'spin' : undefined} aria-hidden />
      </RacButton>
    </Tip>
  );
}

export function SeasonsSection({ store, type, item }: { store: Store; type: TaskType; item: LibraryItem }) {
  useSeasonsRefresh(store, type, item);
  useDoubanSeasonsRefresh(store, type, item);
  const busy = useSeasonsBusy(item.id);
  // 没有 TMDB / IMDb 编号的剧集、电影：整节不显示
  if (!seasonsRef(type, item)) return null;
  const seasons = seasonsOf(type, item);
  const refresh = <SeasonsRefreshButton store={store} type={type} item={item} />;
  if (!seasons.length) {
    // 拉过但一季都没有，或者还没拉到（离线、没登录、上次拉失败）：留个标题和刷新按钮
    const stored = hasStoredSeasons(type, item);
    return (
      <Section title={tr('季')} extra={refresh} className="lib-seasons">
        <p className="season-empty" aria-live="polite">
          {busy ? tr('正在拉季…') : stored ? tr('TMDB 上还没有这部剧的季') : tr('还没拉到季')}
        </p>
      </Section>
    );
  }
  const tv = readSeasons(item.fields)?.tv;
  // 资料本身不是从 TMDB 来的（比如豆瓣 + IMDb 编号）：季这里单独写来源（TMDB 要求署名）
  const src = sourceOfFields(item.fields);
  const credit = tv && src?.source !== 'tmdb' ? `https://www.themoviedb.org/${tv}` : null;
  return (
    <Section title={tr('季 {length}', { length: seasons.length })} extra={refresh} className="lib-seasons">
      <ul className="season-grid">
        {seasons.map((s) => {
          const title = seasonTitle(s);
          const sub = seasonSubtitle(s);
          const meta = seasonMeta(s);
          return (
            <li key={s.number} className="season-card">
              <SeasonPoster s={s} label={`${item.name} ${title}`} />
              <span className="season-text">
                <span className="season-title">{title}</span>
                {sub && <span className="season-sub" title={sub}>{sub}</span>}
                {meta && <span className="season-meta">{meta}</span>}
              </span>
              <SeasonLinks item={item} s={s} title={title} />
            </li>
          );
        })}
      </ul>
      {credit && (
        <div className="source-note season-source">
          {tr('资料来自')}{' '}
          <ExtLink href={credit} label={tr('在 {label} 打开', { label: 'TMDB' })}>
            TMDB
          </ExtLink>
        </div>
      )}
    </Section>
  );
}
