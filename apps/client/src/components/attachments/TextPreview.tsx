/**
 * 纯文本附件预览（Rei 2026-11-09「附件是.txt文件，点击可以和图片一样预览」「加上.md、.csv吧」）。
 * 和图片灯箱同一个深色浮层、同一个顶栏（文件名、下载、关闭），Esc、点纸面外面、× 都能关。
 * 中间一张「纸」跟着皮肤和亮暗走（--surface / --text），能滚、能选中复制；手机上铺满整屏。
 * - .txt / .log / .json 等：等宽字体原文，自动折行
 * - .md：排好版只读显示（和任务正文同一套 Markdown 渲染、同样消毒），顶栏能切回原文
 * - .csv / .tsv：简单表格，第一行当表头；行列太多（2000 行 / 60 列以上）或引号没配上就显示原文，顶栏能切原文
 * 最多读 1 MB，超过只显示前 1 MB 并提示下载；一律按 UTF-8 解码，像乱码时提示；读不出来（二进制、没传上来、离线、出错）给下载按钮。
 */
import { useEffect, useMemo, useState } from 'react';
import { Button as RacButton, Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { Download, X } from 'lucide-react';
import { formatFileSize, textPreviewFormat, type Attachment } from '@mindough/core';
import { loadAttachmentText, parseDelimited, TEXT_PREVIEW_LIMIT, type TextLoadResult } from '../../lib/text-preview';
import { Markdown } from '../Markdown';
import { tr } from '../../lib/i18n';

type View = 'pretty' | 'source';

export function TextPreview({
  attachment,
  onClose,
  onDownload,
  canDownload = () => true,
  load = loadAttachmentText,
}: {
  attachment: Attachment | null;
  onClose: () => void;
  onDownload: (a: Attachment) => void;
  canDownload?: (a: Attachment) => boolean;
  /** 测试用 */
  load?: (a: Attachment) => Promise<TextLoadResult>;
}) {
  const a = attachment;
  const format = a ? textPreviewFormat(a.file_name, a.mime) : null;
  const [res, setRes] = useState<TextLoadResult | null>(null);
  const [view, setView] = useState<View>('pretty');
  useEffect(() => {
    setRes(null);
    setView('pretty');
    if (!a) return;
    let alive = true;
    void load(a).then((r) => alive && setRes(r), () => alive && setRes({ ok: false, reason: 'failed' }));
    return () => {
      alive = false;
    };
  }, [a?.id, a?.r2_key]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = res?.ok ? res.text : '';
  const rows = useMemo(() => (res?.ok && (format === 'csv' || format === 'tsv') ? parseDelimited(text, format === 'tsv' ? '\t' : ',') : null), [res, format, text]);
  const canPretty = format === 'markdown' || ((format === 'csv' || format === 'tsv') && !!rows && rows.length > 0);
  const pretty = canPretty && view === 'pretty';
  const garbled = useMemo(() => looksGarbled(text), [text]);
  const dl = a && canDownload(a);
  const dlButton = a && (
    <RacButton className="textpv-dl" isDisabled={!dl} onPress={() => onDownload(a)}>
      <Download size={15} aria-hidden />
      {tr('下载')}
    </RacButton>
  );

  return (
    <ModalOverlay isOpen={!!a} onOpenChange={(o) => !o && onClose()} isDismissable className="lightbox-overlay textpv-overlay">
      <Modal className="lightbox-modal">
        <Dialog className="lightbox" aria-label={a ? tr('文本「{name}」', { name: a.file_name }) : tr('文本')}>
          {a && (
            <div className="lightbox-body textpv">
              <div className="lightbox-bar">
                <div className="lightbox-title">
                  <span className="lightbox-name">{a.file_name}</span>
                  {a.size > 0 && <span className="lightbox-count">{formatFileSize(a.size)}</span>}
                </div>
                {canPretty && res?.ok && (
                  <RacButton className="lightbox-btn textpv-toggle" aria-pressed={view === 'source'} onPress={() => setView((v) => (v === 'pretty' ? 'source' : 'pretty'))}>
                    {view === 'source' ? (format === 'markdown' ? tr('排版') : tr('表格')) : tr('原文')}
                  </RacButton>
                )}
                <RacButton className="lightbox-btn" aria-label={dl ? tr('下载') : tr('离线中，没缓存的附件下载不了')} isDisabled={!dl} onPress={() => onDownload(a)}>
                  <Download size={20} />
                </RacButton>
                <RacButton className="lightbox-btn" aria-label={tr('关闭')} onPress={onClose} autoFocus>
                  <X size={22} />
                </RacButton>
              </div>
              <div
                className="textpv-stage"
                onClick={(e) => {
                  // 点在纸面外面关闭
                  if (e.target === e.currentTarget) onClose();
                }}
              >
                <div className={`textpv-sheet${pretty ? ` is-${format}` : ' is-source'}`} tabIndex={0} aria-label={a.file_name}>
                  {!res ? (
                    <p className="textpv-msg">{tr('正在载入…')}</p>
                  ) : !res.ok ? (
                    <div className="textpv-msg">
                      <p>{failText(res.reason)}</p>
                      {dlButton}
                    </div>
                  ) : (
                    <>
                      {res.truncated && (
                        <div className="textpv-note">
                          <span>{tr('只显示了前 {limit}，整个文件 {size}，下载后能看全部', { limit: formatFileSize(TEXT_PREVIEW_LIMIT), size: formatFileSize(res.size) })}</span>
                          {dlButton}
                        </div>
                      )}
                      {garbled && <div className="textpv-note">{tr('看起来不是 UTF-8 编码，可能显示成乱码，可以下载后用别的应用打开')}</div>}
                      {!text ? (
                        <p className="textpv-msg">{tr('（空文件）')}</p>
                      ) : pretty && format === 'markdown' ? (
                        <Markdown source={text} className="textpv-md" />
                      ) : pretty && rows ? (
                        <CsvTable rows={rows} />
                      ) : (
                        <pre className="textpv-pre">{text}</pre>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function CsvTable({ rows }: { rows: string[][] }) {
  const cols = Math.max(...rows.map((r) => r.length));
  const [head, ...body] = rows;
  const cells = (r: string[]) => Array.from({ length: cols }, (_, i) => r[i] ?? '');
  return (
    <div className="textpv-table-wrap">
      <table className="textpv-table">
        <thead>
          <tr>
            {cells(head!).map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, j) => (
            <tr key={j}>
              {cells(r).map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function failText(reason: Extract<TextLoadResult, { ok: false }>['reason']): string {
  if (reason === 'missing') return tr('文件还没传上来，在添加它的设备上联网后就能下载');
  if (reason === 'offline') return tr('离线中，没缓存的附件下载不了，联网后再试');
  if (reason === 'binary') return tr('这个文件不是纯文本，没法预览，可以下载后打开');
  return tr('没读出文件内容，可以下载后打开');
}

/** UTF-8 解不开的字（U+FFFD）占了不少：多半是 GBK 之类的别的编码。 */
export function looksGarbled(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 20000);
  let bad = 0;
  for (let i = 0; i < sample.length; i++) if (sample.charCodeAt(i) === 0xfffd) bad++;
  return bad >= 3 && bad / sample.length > 0.01;
}
