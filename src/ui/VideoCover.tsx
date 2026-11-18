// The tap-to-play cover of an embedded video: a black box with one centered play button, as
// YouTube shows its player before it starts. Every video card that loads its player in a
// WebView on tap uses it, so they all look the same. Tapping it calls `onPress`; the card then
// swaps the cover for its WebView.
import { Canvas, signal, View, WebView } from "nsh";
import { VIDEO_FULLSCREEN_SCRIPT } from "./webviewFullscreen";

const BUTTON = 68;

/** The play button: a translucent dark disc with a white triangle, drawn in code like the icons. */
function PlayButton() {
  return (
    <Canvas
      style={{ width: BUTTON, height: BUTTON }}
      draw={(cx, size) => {
        const s = size.width;
        const c = s / 2;
        cx.fillStyle = "rgba(0, 0, 0, 0.6)";
        cx.beginPath();
        cx.arc(c, c, s / 2, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = "#fff";
        cx.beginPath();
        cx.moveTo(c - s * 0.1, c - s * 0.2);
        cx.lineTo(c - s * 0.1, c + s * 0.2);
        cx.lineTo(c + s * 0.22, c);
        cx.closePath();
        cx.fill();
      }}
    />
  );
}

/**
 * The cover of an embedded video, sized by its `height`, or by its `aspectRatio` (width / height).
 * `label` names the video for screen readers only: nothing is written on the cover.
 */
export function VideoCover(props: { label: string; onPress: () => void; height?: number; aspectRatio?: number }) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.label}
      style={{
        height: props.height,
        aspectRatio: props.aspectRatio,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000",
      }}
    >
      <PlayButton />
    </View>
  );
}

/**
 * A video page in a WebView, behind a VideoCover: the page loads only when the cover is tapped.
 * Sized like the cover. `onError` is passed on to the WebView.
 */
export function VideoPage(props: {
  src: string;
  label: string;
  height?: number;
  aspectRatio?: number;
  onError?: (e: { message: string; code?: string }) => void;
}) {
  const started = signal(false);
  return started() ? (
    <WebView
      src={props.src}
      injectedJavaScript={VIDEO_FULLSCREEN_SCRIPT}
      onError={props.onError}
      style={{ height: props.height, aspectRatio: props.aspectRatio, backgroundColor: "#000", borderRadius: 8 }}
    />
  ) : (
    <VideoCover label={props.label} height={props.height} aspectRatio={props.aspectRatio} onPress={() => started.set(true)} />
  );
}
