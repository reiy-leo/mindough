import type { ReactNode } from 'react';
import { useSettings } from '../lib/settings';
import { TopbarActions } from '../lib/topbar-slot';

/**
 * 页头。compact（项目页，Rei 2026-10-26「标题和图标左上角，小一点，和右侧图标对齐」）：
 * 图标、标题、副标题和右边的图标按钮在同一行，垂直居中、同高；副标题跟在标题后面、放不下就省略。
 * 手机上非 compact 的页头不画（Rei 2026-11-12 09:41「手机端的每一页的顶部都有header……页面都不用header」）：
 * 标题只留读屏 h1，右边的按钮送到顶栏右边（lib/topbar-slot），副标题、图标不显示。compact（项目详情页，标题就是项目名、能改名）照旧。
 */
export function PageHeader({
  title,
  titleNode,
  subtitle,
  icon,
  actions,
  compact = false,
}: {
  title: string;
  /** compact 页头里代替「图标 + h1」的整块（项目页：点图标换图标、点名字改名，Rei 2026-11-01）。 */
  titleNode?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const { layout } = useSettings();
  if (!compact && layout === 'mobile')
    return (
      <>
        <h1 className="sr-only">{title}</h1>
        {actions && <TopbarActions>{actions}</TopbarActions>}
      </>
    );
  if (compact)
    return (
      <header className="page-header is-compact">
        <div className="page-heading">
          {titleNode ?? (
            <>
              {icon && <span className="page-icon">{icon}</span>}
              <h1 className="page-title">{title}</h1>
            </>
          )}
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
    );
  return (
    <header className="page-header">
      <div className="page-heading">
        {icon && <span className="page-icon">{icon}</span>}
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
