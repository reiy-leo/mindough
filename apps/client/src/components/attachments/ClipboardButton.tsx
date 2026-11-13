/**
 * 剪贴板按钮（Rei 2026-10-29）：剪贴板里有图片（桌面 App 也认文件）时才出现，点了把它们交给 onFiles（走附件上传队列）。
 * 什么时候出现、怎么读，见 lib/clipboard-files.ts。没东西时什么都不渲染。
 */
import { useState } from 'react';
import { Button as RacButton } from 'react-aria-components';
import { ClipboardPaste } from 'lucide-react';
import { Tip } from '../../ui/primitives';
import { useUi } from '../../lib/ui';
import { useClipboardFiles } from '../../lib/clipboard-files';
import { tr } from '../../lib/i18n';

export function ClipboardButton({ onFiles, imagesOnly = false, className = 'icon-btn' }: { onFiles: (files: File[]) => void; imagesOnly?: boolean; className?: string }) {
  const ui = useUi();
  const { found, take } = useClipboardFiles(imagesOnly);
  const [busy, setBusy] = useState(false);
  if (!found) return null;
  const label = found.kind === 'files' ? tr('加上剪贴板里的 {n} 个文件', { n: found.count }) : found.count > 1 ? tr('加上剪贴板里的 {n} 张图片', { n: found.count }) : tr('加上剪贴板里的图片');
  return (
    <Tip content={label}>
      <RacButton
        className={`${className} clip-btn`}
        aria-label={label}
        isDisabled={busy}
        onPress={() => {
          setBusy(true);
          take()
            .then((files) => files.length && onFiles(files))
            .catch((err) => {
              console.error('读剪贴板失败', err);
              ui.toast({ tone: 'error', message: tr('没读到剪贴板里的内容，再复制一次试试') });
            })
            .finally(() => setBusy(false));
        }}
      >
        <ClipboardPaste size={18} aria-hidden />
      </RacButton>
    </Tip>
  );
}
