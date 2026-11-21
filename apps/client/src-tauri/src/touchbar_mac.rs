//! Touch Bar 的 AppKit 部分（只在 macOS 编译，见 touchbar.rs）。不依赖 Tauri，方便单独拿去 `cargo check --target x86_64-apple-darwin`。
//!
//! 做法：主窗口（NSWindow）挂一条 NSTouchBar，里面一个 NSCustomTouchBarItem，装一个单选的 NSSegmentedControl，6 段依次是
//! 我的一天、日历、项目、打卡、倒数日、日记。单选分段控件自带「当前这段高亮」，点哪段只需要一个 target-action。
//! 默认项里还放了 OtherItemsProxy：网页里正在打字时，WKWebView 自己的那组按钮（输入建议等）照样能排进来。
//! 图标用 SF Symbols（macOS 11 起有），挑和侧栏 Lucide 图标最像的；系统太旧或某个符号没有，就退成文字。
//! 这里的函数都要在主线程调（MainThreadMarker 拿不到就什么都不做）。

use std::cell::RefCell;
use std::sync::OnceLock;

use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol};
use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSCustomTouchBarItem, NSImage, NSSegmentSwitchTracking, NSSegmentedControl, NSTouchBar, NSTouchBarItem,
    NSTouchBarItemIdentifierOtherItemsProxy, NSWindow,
};
use objc2_foundation::{NSArray, NSSet, NSString};

/// 一个按钮：发给前端的名字（和深链 view/{页面} 的名字一样）+ 依次试的 SF Symbols 名。
pub struct Slot {
    pub key: &'static str,
    symbols: &'static [&'static str],
}

/// 6 个按钮，顺序就是 Touch Bar 上从左到右的顺序。图标对照侧栏（App.tsx NAV_SECTIONS 用的 Lucide）：
/// Sun → sun.max；Calendar → calendar；Shapes → square.on.circle；CalendarCheck2 → calendar.badge.checkmark（macOS 13 起，
/// 旧系统退到 checkmark.circle）；Hourglass → hourglass；NotebookPen → square.and.pencil。
pub const SLOTS: [Slot; 6] = [
    Slot { key: "myday", symbols: &["sun.max"] },
    Slot { key: "calendar", symbols: &["calendar"] },
    Slot { key: "projects", symbols: &["square.on.circle", "square.grid.2x2"] },
    Slot { key: "checkin", symbols: &["calendar.badge.checkmark", "checkmark.circle"] },
    Slot { key: "countdown", symbols: &["hourglass"] },
    Slot { key: "journal", symbols: &["square.and.pencil"] },
];

const ITEM_ID: &str = "dev.rei8t.mindough.touchbar.nav";

/// 点了按钮以后做什么（touchbar.rs 装进来：发事件给主窗口）。
static ON_PICK: OnceLock<Box<dyn Fn(&'static str) + Send + Sync>> = OnceLock::new();

pub fn set_on_pick(f: Box<dyn Fn(&'static str) + Send + Sync>) {
    let _ = ON_PICK.set(f);
}

define_class!(
    // 只有一个空的 NSObject 子类，接分段控件的 action；没有 ivars，不实现 Drop。
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "MindoughTouchBarTarget"]
    struct Target;

    unsafe impl NSObjectProtocol for Target {}

    impl Target {
        #[unsafe(method(pick:))]
        fn pick(&self, sender: &NSSegmentedControl) {
            let picked = usize::try_from(sender.selectedSegment()).ok().and_then(|i| SLOTS.get(i));
            if let (Some(slot), Some(f)) = (picked, ON_PICK.get()) {
                f(slot.key);
            }
        }
    }
);

impl Target {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        unsafe { msg_send![Self::alloc(mtm), init] }
    }
}

struct State {
    window: usize,
    control: Retained<NSSegmentedControl>,
    // 控件的 target 是弱引用，得自己留着；NSTouchBar 窗口会留着，这里也存一份，换窗口时一起放掉
    _target: Retained<Target>,
    _bar: Retained<NSTouchBar>,
}

thread_local! {
    static STATE: RefCell<Option<State>> = const { RefCell::new(None) };
}

fn build(mtm: MainThreadMarker, window_ptr: usize) -> State {
    let control = NSSegmentedControl::new(mtm);
    control.setSegmentCount(SLOTS.len() as isize);
    control.setTrackingMode(NSSegmentSwitchTracking::SelectOne);
    let target = Target::new(mtm);
    unsafe {
        control.setTarget(Some(&target));
        control.setAction(Some(sel!(pick:)));
    }

    let id = NSString::from_str(ITEM_ID);
    let item = NSCustomTouchBarItem::initWithIdentifier(NSCustomTouchBarItem::alloc(mtm), &id);
    item.setView(&control);

    let bar = NSTouchBar::new(mtm);
    let proxy: &NSString = unsafe { NSTouchBarItemIdentifierOtherItemsProxy };
    bar.setDefaultItemIdentifiers(&NSArray::from_slice(&[&*id, proxy]));
    let as_item: &NSTouchBarItem = &item;
    bar.setTemplateItems(&NSSet::from_slice(&[as_item]));
    bar.setPrincipalItemIdentifier(Some(&id));

    // window_ptr 是 Tauri 给的 NSWindow 指针（WebviewWindow::ns_window），窗口还开着时才会调到这里
    let window = unsafe { &*(window_ptr as *const NSWindow) };
    window.setTouchBar(Some(&bar));

    State { window: window_ptr, control, _target: target, _bar: bar }
}

/// 系统图标；macOS 11 以前没有 SF Symbols，返回 None 退成文字。
fn symbol_image(names: &[&str], description: &NSString) -> Option<Retained<NSImage>> {
    if !objc2::available!(macos = 11.0) {
        return None;
    }
    names
        .iter()
        .find_map(|n| NSImage::imageWithSystemSymbolName_accessibilityDescription(&NSString::from_str(n), Some(description)))
}

/// 装上（第一次，或主窗口换了）并刷新文字和高亮。labels 跟 SLOTS 一一对应，是按钮的提示和无障碍文字；
/// active 是当前页对应的按钮，None 表示当前页不在这 6 个里，全不高亮。
pub fn apply(window_ptr: usize, labels: &[String; 6], active: Option<usize>) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    STATE.with(|cell| {
        let mut state = cell.borrow_mut();
        if state.as_ref().map_or(true, |s| s.window != window_ptr) {
            *state = Some(build(mtm, window_ptr));
        }
        let Some(s) = state.as_ref() else { return };
        for (i, (slot, label)) in SLOTS.iter().zip(labels.iter()).enumerate() {
            let seg = i as isize;
            let text = NSString::from_str(label);
            s.control.setToolTip_forSegment(Some(&text), seg);
            match symbol_image(slot.symbols, &text) {
                Some(img) => {
                    s.control.setImage_forSegment(Some(&img), seg);
                    s.control.setLabel_forSegment(&NSString::from_str(""), seg);
                }
                None => {
                    s.control.setImage_forSegment(None, seg);
                    s.control.setLabel_forSegment(&text, seg);
                }
            }
        }
        s.control.setSelectedSegment(active.filter(|&a| a < SLOTS.len()).map_or(-1, |a| a as isize));
    });
}
