/**
 * 资料页的「季」（Rei 2026-11-11「影视库里的剧集显示 seasons」）：剧集按 TMDB 列出各季——
 * 海报小图、第 N 季（特别篇放最后）、首播年份、集数。只显示，不记每季看到哪；电影不显示。
 * 数据存在资料的 `_seasons` 里（core/seasons.ts），缺了由 lib/seasons.ts 在后台补拉一次。
 */
import { useState, type CSSProperties } from 'react';
import { placeholderArt, seasonMeta, seasonPosterUrl, seasonsOf, seasonSubtitle, seasonTitle, readSeasons, sourceOfFields, type LibraryItem, type SeasonInfo, type Store, type TaskType } from '@mindough/core';
import { Section } from '../../ui/primitives';
import { useSeasonsRefresh } from '../../lib/seasons';
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

export function SeasonsSection({ store, type, item }: { store: Store; type: TaskType; item: LibraryItem }) {
  useSeasonsRefresh(store, type, item);
  const seasons = seasonsOf(type, item);
  if (!seasons.length) return null;
  const tv = readSeasons(item.fields)?.tv;
  // 资料本身不是从 TMDB 来的（比如豆瓣 + IMDb 编号）：季这里单独写来源（TMDB 要求署名）
  const src = sourceOfFields(item.fields);
  const credit = tv && src?.source !== 'tmdb' ? `https://www.themoviedb.org/${tv}` : null;
  return (
    <Section title={tr('季 {length}', { length: seasons.length })} className="lib-seasons">
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
