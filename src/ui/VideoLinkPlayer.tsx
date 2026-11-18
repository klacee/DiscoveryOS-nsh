// A video link in a post that no other module plays: a tap-to-play cover, then its page (or file)
// opens in a WebView. If the WebView cannot open it, a line of text says so.
import { signal, Text, View } from "nsh";
import { palette } from "./appearance";
import { VideoPage } from "./VideoCover";

export function VideoLinkPlayer(props: { url: string }) {
  const failed = signal<string | null>(null);
  // The branch is read inside the JSX, so it updates when the signal changes.
  return (
    <View style={{ alignSelf: "stretch" }}>
      {failed() !== null ? (
        <Text style={{ fontSize: 12, color: palette().muted }}>{`无法打开视频 ${props.url}（${failed()}）`}</Text>
      ) : (
        <VideoPage
          src={props.url}
          label="播放视频"
          aspectRatio={16 / 9}
          onError={(e) => failed.set(e.code ?? e.message)}
        />
      )}
    </View>
  );
}
