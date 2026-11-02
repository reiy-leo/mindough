/**
 * 中文输入法组字（Rei 2026-11-02「例如这是中文输入法，我只要选择任何一个，就立马新建一行新的todo」）。
 *
 * 毛病出在 WebKit（Safari、Mac 客户端的 WKWebView）：选词上屏时它先删掉组字的拼音（deleteCompositionText），再插入选中的词（insertFromComposition）。
 * 删拼音那一步会把删空了的、带 position: relative 的祖先节点一起删掉（ProseMirror #934）——空清单项 li 就是这样的节点，
 * 于是整个清单项被删、词插到列表里别的地方，ProseMirror 读回来就成了另起的一行。数字键、空格、点候选、回车选词都一样，跟回车键没关系。
 *
 * 三层：
 * 1. WebKit 上组字期间在光标处放一个空 span（ProseMirror-ime-span），清单项 / 段落删完拼音也不会是空的，WebKit 就不删它（做法同 prosemirror-safari-ime-span）；
 * 2. 兜底：组字开始时记下文档，结束后结构（节点和属性，不算文字）变了，就按「原文档 + 上屏的词」改回来——组字只会加字，不会拆行、新建项；
 * 3. 回车：组字中、WebKit 的 229、组字结束 100ms 内的回车（含 ProseMirror 自己从 DOM 变化猜出来的回车）都不当回车，
 *    不拆清单项、不新建下一行；优先级最高，清单、折叠块、公式的回车处理都排在它后面。
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { imeEnter } from '../../lib/ime';

/** 和 ProseMirror 自己的判断一样：Safari 和所有 WKWebView（Tauri Mac 客户端）。 */
const webkitIme = typeof navigator !== 'undefined' && /Apple Computer/.test(navigator.vendor);

/** 组字结束后多久检查结构（ProseMirror 在 compositionend 后 20ms 收尾）。 */
const HEAL_DELAY = 50;

/** 文档的骨架：所有非文字节点的类型和属性（文字不算）。组字前后骨架应该一样。 */
export function skeleton(doc: PMNode): string {
  const out: string[] = [];
  doc.descendants((n) => {
    if (!n.isText) out.push(`${n.type.name}${Object.keys(n.attrs).length ? JSON.stringify(n.attrs) : ''}/${n.childCount}`);
  });
  return out.join('|');
}

/** 组字多出来的字：前后都一样的部分去掉，剩下的（换行、零宽空格不算）。compositionend 没带 data 时用。 */
export function insertedText(before: PMNode, after: PMNode): string {
  const a = before.textBetween(0, before.content.size, '\n');
  const b = after.textBetween(0, after.content.size, '\n');
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return b.slice(i, b.length - j).replace(/[\n\u200b]/g, '');
}

interface Snapshot {
  doc: PMNode;
  from: number;
  to: number;
  at: number;
}

const spanKey = new PluginKey('md-ime-span');

export function imeGuardExtension() {
  return Extension.create({
    name: 'mindoughImeGuard',
    priority: 2000,
    addProseMirrorPlugins() {
      /** 我们自己的「正在组字」（ProseMirror 的 view.composing 有时提前结束，见 #1190）。 */
      let composing = false;
      let lastEnd = 0;
      /** 第几次组字：结束后的检查只管自己那次。 */
      let generation = 0;
      let snap: Snapshot | null = null;
      /** 组字期间有不是打字来的改动（外面整篇换掉之类）：不兜底，免得把它改回去。 */
      let foreign = false;

      const take = (view: EditorView) => {
        const { doc, selection } = view.state;
        snap = { doc, from: selection.from, to: selection.to, at: Date.now() };
      };

      const heal = (view: EditorView, gen: number, committed: string) => {
        let data = committed;
        const s = snap;
        if (gen !== generation || composing || !s || foreign || view.isDestroyed) return;
        const state = view.state;
        if (skeleton(state.doc) === skeleton(s.doc)) return;
        // 结构变了：回到组字前的文档，再把上屏的词放进原来的位置
        if (!data) data = insertedText(s.doc, state.doc);
        let tr = state.tr.replaceWith(0, state.doc.content.size, s.doc.content);
        const pos = Math.min(s.from, tr.doc.content.size);
        tr = tr.setSelection(TextSelection.create(tr.doc, pos, Math.min(s.to, tr.doc.content.size)));
        if (data) tr = tr.insertText(data);
        view.dispatch(tr.scrollIntoView());
      };

      return [
        new Plugin({
          key: spanKey,
          // 组字期间外面整篇换掉（setMarkdown 不进撤销历史）：这次不兜底
          filterTransaction(tr) {
            if (composing && tr.docChanged && tr.getMeta('addToHistory') === false) foreign = true;
            return true;
          },
          props: {
            // span 跟着「正在组字」走，不另外发事务（组字刚开始就重画光标那段，Safari 会把组字打断）：下一次读 DOM 的事务带上它，组字结束后的那次去掉
            decorations(state) {
              if (!webkitIme || !composing) return null;
              const { $from, $to, to } = state.selection;
              if (!$from.sameParent($to) || !$from.parent.inlineContent) return null;
              return DecorationSet.create(state.doc, [
                Decoration.widget(to, (view) => {
                  const span = view.dom.ownerDocument.createElement('span');
                  span.className = 'ProseMirror-ime-span';
                  return span;
                }, { ignoreSelection: true, key: 'ime-span', side: 1 }),
              ]);
            },
            handleDOMEvents: {
              keydown(view, event) {
                // 组字的第一个键（229）：这时文档里还没有拼音，记下组字前的样子
                if (!composing && event.keyCode === 229 && !view.composing) take(view);
                return false;
              },
              compositionstart(view) {
                if (!composing) {
                  composing = true;
                  foreign = false;
                  generation++;
                  // 没赶上 229 那次（或者隔太久了）：就用现在的
                  if (!snap || Date.now() - snap.at > 1000) take(view);
                }
                return false;
              },
              compositionend(view, event) {
                composing = false;
                lastEnd = Date.now();
                const gen = generation;
                const data = (event as CompositionEvent).data ?? '';
                setTimeout(() => {
                  heal(view, gen, data);
                  if (gen === generation && !composing) snap = null;
                }, HEAL_DELAY);
                return false;
              },
            },
            handleKeyDown(view, event) {
              if (event.key !== 'Enter') return false;
              // 组字中（含 ProseMirror 从 DOM 变化猜出来的回车）、229、紧跟组字结束的回车：只是上屏，不拆行
              if (composing || view.composing || imeEnter(event, lastEnd)) {
                event.preventDefault?.();
                return true;
              }
              return false;
            },
          },
        }),
      ];
    },
  });
}
