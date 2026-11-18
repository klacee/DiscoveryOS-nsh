// About DiscoveryOS: the running build, the kept package and the last update check. The same app-drawn
// dialog on every platform (no native About panel). Opened from the About menu items (`commands.ts`);
// a press outside the card or Close dismisses it.
import { Overlay, signal, Text, View, type ViewRef } from "nsh";
import { Updater } from "discoveryos/native";
import { palette } from "./appearance";
import { buildHex } from "../updateManifest";
import { applyUpdateNow, availableUpdate } from "../update";

/** Whether the About dialog is shown. Set from the menu; read by the app root. */
export const aboutOpen = signal(false);

export function openAbout(): void {
  aboutOpen.set(true);
}

function closeAbout(): void {
  aboutOpen.set(false);
}

// The faint colour of a shared build prefix: the muted text mixed toward the card's surface. Nested text
// spans take a colour but not an opacity, so the faint part is drawn with a colour of its own.
function faintColor(): string {
  const a = palette().muted;
  const b = palette().surface;
  const channel = (i: number) => {
    const from = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
    const to = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(from * 0.45 + to * 0.55).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

// Builds are Unix times, which read better in hex: shown as uppercase digits, no prefix.
function hexBuild(value: unknown): string {
  return buildHex(Number(value ?? 0));
}

// A piece of a line. A faint piece is the leading part every build shown shares, drawn dimmer so the part that differs stands out.
type Segment = { text: string; faint?: boolean };

// A line of the panel. `indent` sets it under the line above; `action` puts the 立即生效 button after its text.
type Line = { segments: Segment[]; indent?: boolean; action?: boolean };

// A space that must not be dropped where a text piece ends or the line wraps.
const NBSP = "\u00A0";

// The number of leading characters two hex builds share.
function sharedPrefixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

// The number of leading characters all the builds share.
function commonPrefixLength(builds: string[]): number {
  let n = builds[0].length;
  for (const build of builds) n = Math.min(n, sharedPrefixLength(builds[0], build));
  return n;
}

// The lines About shows, from the runner's JSON (the same fields the macOS panel reads).
function aboutLines(): Line[] {
  let info: Record<string, unknown> = {};
  try {
    info = JSON.parse(Updater.aboutInfo()) as Record<string, unknown>;
  } catch {
    return [{ segments: [{ text: "无法获取详细信息。" }] }];
  }
  const source = info.runningSource === "package" ? "更新包" : "内置";
  const running = hexBuild(info.runningBuild);
  const embedded = hexBuild(info.embeddedBuild);
  // The last check reads "<time> · <result>"; a result that names a build has that build in it.
  const last = typeof info.lastCheck === "string" ? info.lastCheck : "";
  const sep = last.indexOf(" · ");
  const when = sep >= 0 ? last.slice(0, sep) : "";
  const result = sep >= 0 ? last.slice(sep + 3) : last;
  const found = /\(build ([0-9A-Fa-f]+)\)/.exec(result);
  const checkHex = found ? found[1].toUpperCase() : undefined;
  // The leading characters every build shown shares are drawn faint, in each of them.
  const shared = commonPrefixLength(checkHex ? [running, embedded, checkHex] : [running, embedded]);
  const hexSegments = (hex: string): Segment[] => [
    { text: hex.slice(0, shared), faint: true },
    { text: hex.slice(shared) },
  ];
  const lines: Line[] = [
    { segments: [{ text: `版本${NBSP}${String(info.embeddedVersion ?? "?")}${NBSP}build${NBSP}` }, ...hexSegments(embedded)] },
    { segments: [{ text: `运行${NBSP}build${NBSP}` }, ...hexSegments(running), { text: `${NBSP}(${source})` }] },
  ];
  const pkg = info.package as Record<string, unknown> | null | undefined;
  if (!(pkg && typeof pkg === "object") && info.pendingSwap === true) {
    lines.push({ segments: [{ text: "更新包：已切换，等待健康检查" }] });
  }
  if (!last) {
    lines.push({ segments: [{ text: "上次检查：尚未检查" }] });
  } else {
    lines.push({ segments: [{ text: sep >= 0 ? `上次检查于${NBSP}${when}：` : "上次检查：" }] });
    const body: Segment[] = found
      ? [
          { text: result.slice(0, found.index + found[0].indexOf(found[1])) },
          ...hexSegments(checkHex!),
          { text: result.slice(found.index + found[0].indexOf(found[1]) + found[1].length) },
        ]
      : [{ text: result }];
    lines.push({ segments: body, indent: true });
    if (availableUpdate()) lines.push({ segments: [{ text: "重启生效, 或者" }], indent: true, action: true });
  }
  return lines;
}

export function AboutDialog() {
  // The card's place, which the outside-press overlay is anchored to.
  const card = signal<ViewRef | null>(null);
  return (
    <>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      >
        <View
          ref={(n: ViewRef | null) => card.set(n)}
          accessibilityLabel="关于 DiscoveryOS"
          style={{
            width: 360,
            padding: 20,
            gap: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette().border,
            backgroundColor: palette().surface,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 600, color: palette().text }}>DiscoveryOS</Text>
          {/* Each line is one text, so its words wrap together inside the card; the faint pieces are nested spans.
              The action line ends with the 立即生效 button. */}
          {aboutLines().map((line) => (
            <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: line.indent ? 12 : 0 }}>
              <Text style={{ fontSize: 12, color: palette().muted, flexShrink: 1 }}>
                {line.segments.map((segment) => (
                  <Text style={{ color: segment.faint ? faintColor() : palette().muted }}>{segment.text}</Text>
                ))}
              </Text>
              {line.action ? (
                <View
                  onPress={applyUpdateNow}
                  accessibilityLabel="立即生效"
                  style={{
                    marginLeft: 8,
                    paddingVertical: 2,
                    paddingHorizontal: 10,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: palette().border,
                  }}
                >
                  <Text style={{ fontSize: 12, color: palette().text }}>立即生效</Text>
                </View>
              ) : null}
            </View>
          ))}
          <View
            onPress={closeAbout}
            accessibilityLabel="关闭"
            style={{
              alignSelf: "flex-end",
              marginTop: 8,
              paddingVertical: 6,
              paddingHorizontal: 14,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: palette().border,
            }}
          >
            <Text style={{ fontSize: 13, color: palette().text }}>关闭</Text>
          </View>
        </View>
      </View>
      {card() ? (
        <Overlay anchor={card()} onPressOutside={closeAbout}>
          <View style={{ width: 0, height: 0 }} />
        </Overlay>
      ) : null}
    </>
  );
}
