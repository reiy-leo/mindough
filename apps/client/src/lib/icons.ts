import {
  BookOpen,
  Clapperboard,
  FileText,
  Folder,
  FolderGit2,
  Gamepad2,
  GraduationCap,
  Plane,
  Salad,
  ShoppingBag,
  UserRound,
  Utensils,
  Star,
  Heart,
  Music,
  Dumbbell,
  Briefcase,
  NotebookPen,
  Archive,
  PartyPopper,
  HeartPulse,
  Sparkles,
  SprayCan,
  Tag,
  Leaf,
  AlarmClock,
  Flower2,
  Pill,
  Wallet,
  PenLine,
  Languages,
  Guitar,
  Palette,
  Users,
  PawPrint,
  Sprout,
  ShoppingCart,
  Scissors,
  Wrench,
  Tv,
  Mic,
  Camera,
  Car,
  Coffee,
  Code,
  Gift,
  Globe,
  Home,
  Lightbulb,
  MapPin,
  Mountain,
  Trophy,
  Wine,
  Bike,
  Baby,
  Bookmark,
  Calendar,
  Headphones,
  Film,
  Flag,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';
import { createElement, type ComponentType } from 'react';

/** 类型图标名 → lucide 组件。自定义类型可选这些。 */
export const TYPE_ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  clapperboard: Clapperboard,
  'gamepad-2': Gamepad2,
  'book-open': BookOpen,
  folder: Folder,
  'folder-git-2': FolderGit2,
  'graduation-cap': GraduationCap,
  plane: Plane,
  'shopping-bag': ShoppingBag,
  utensils: Utensils,
  salad: Salad,
  'user-round': UserRound,
  star: Star,
  heart: Heart,
  music: Music,
  dumbbell: Dumbbell,
  briefcase: Briefcase,
  // 打卡分类
  'notebook-pen': NotebookPen,
  archive: Archive,
  'party-popper': PartyPopper,
  'heart-pulse': HeartPulse,
  sparkles: Sparkles,
  'spray-can': SprayCan,
  tag: Tag,
  leaf: Leaf,
  'alarm-clock': AlarmClock,
  'flower-2': Flower2,
  pill: Pill,
  wallet: Wallet,
  'pen-line': PenLine,
  languages: Languages,
  guitar: Guitar,
  palette: Palette,
  users: Users,
  'paw-print': PawPrint,
  sprout: Sprout,
  'shopping-cart': ShoppingCart,
  scissors: Scissors,
  wrench: Wrench,
  tv: Tv,
  // 类型编辑器的图标选择（M4）
  mic: Mic,
  headphones: Headphones,
  film: Film,
  camera: Camera,
  car: Car,
  bike: Bike,
  coffee: Coffee,
  wine: Wine,
  code: Code,
  gift: Gift,
  globe: Globe,
  home: Home,
  lightbulb: Lightbulb,
  'map-pin': MapPin,
  mountain: Mountain,
  trophy: Trophy,
  baby: Baby,
  bookmark: Bookmark,
  calendar: Calendar,
  flag: Flag,
};

/** 图标组件：lucide 的，或把 emoji 包成同样接口（size / className / style）。 */
export type IconComponent = ComponentType<Pick<LucideProps, 'size' | 'className' | 'style' | 'aria-hidden'>>;

/** 图标名是不是 emoji（不是 lucide 名字、也不是 ascii）。类型图标可以是 lucide 名或一个 emoji。 */
export const isEmojiIcon = (name: string | undefined): name is string => !!name && !TYPE_ICONS[name] && /[^\x00-\x7f]/.test(name);

const emojiCache = new Map<string, IconComponent>();
function emojiIcon(ch: string): IconComponent {
  let c = emojiCache.get(ch);
  if (!c) {
    const E: IconComponent = ({ size = 24, className, style }) =>
      createElement('span', { className: `emoji-icon${className ? ` ${className}` : ''}`, style: { fontSize: typeof size === 'number' ? size * 0.92 : size, width: size, height: size, ...style }, 'aria-hidden': true }, ch);
    E.displayName = `Emoji(${ch})`;
    emojiCache.set(ch, E);
    c = E;
  }
  return c;
}

export function typeIcon(name: string | undefined): IconComponent {
  if (isEmojiIcon(name)) return emojiIcon(name);
  return (name && TYPE_ICONS[name]) || FileText;
}

/**
 * 图标选择里给的 lucide 图标，按用途分组（Rei 2026-11-02「项目弹窗中的这个图标部分也太难看了吧」：分组带小标题）。
 * 组名在界面上用 tr()，见 TypeManager 的 IconPicker。folder 是新建项目的默认图标，放在「常用」第一个。
 */
export const PICKER_GROUPS = [
  { id: 'common', icons: ['folder', 'star', 'heart', 'bookmark', 'flag', 'tag', 'sparkles', 'lightbulb', 'trophy'] },
  { id: 'fun', icons: ['clapperboard', 'film', 'tv', 'music', 'mic', 'headphones', 'gamepad-2', 'camera', 'palette', 'guitar', 'party-popper'] },
  { id: 'work', icons: ['book-open', 'notebook-pen', 'pen-line', 'graduation-cap', 'languages', 'code', 'folder-git-2', 'briefcase', 'calendar'] },
  { id: 'travel', icons: ['plane', 'map-pin', 'globe', 'mountain', 'car', 'bike'] },
  { id: 'life', icons: ['home', 'utensils', 'salad', 'coffee', 'wine', 'shopping-bag', 'shopping-cart', 'gift', 'wallet', 'users', 'scissors', 'spray-can'] },
  { id: 'health', icons: ['dumbbell', 'heart-pulse', 'pill', 'leaf', 'sprout', 'flower-2', 'paw-print', 'baby'] },
  { id: 'other', icons: ['wrench', 'archive'] },
] as const;

/** 图标选择里的全部图标（按分组的顺序摊平）。 */
export const PICKER_ICONS: readonly string[] = PICKER_GROUPS.flatMap((g) => g.icons);
