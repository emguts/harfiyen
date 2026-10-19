import { useEffect, useState } from "react";
import type { canEncodeVideo as CanEncodeVideo } from "mediabunny";
import { framing, type Crop } from "./crop";
import { AUDIO_VIDEO, resolutionSizes, type Encoder, type OutputCodec, type SourceInfo } from "./videoOutput";

/** The hardware encoder when there is one, else the processor's. */
async function encoder(
  canEncodeVideo: typeof CanEncodeVideo,
  codec: OutputCodec,
  width: number,
  height: number,
): Promise<Encoder> {
  const can = (hardwareAcceleration: "prefer-hardware" | "prefer-software") =>
    canEncodeVideo(codec, { width, height, hardwareAcceleration }).catch(() => false);
  if (await can("prefer-hardware")) return "hardware";
  return (await can("prefer-software")) ? "software" : null;
}

type FileInfo = Omit<SourceInfo, "resolutions">;

/**
 * Reads the file once (size, frame rate and bitrates from its index) and asks
 * which encoders the browser has at each size on offer. With a crop the
 * picture is the cropped part, and the sizes on offer follow it.
 */
export function useSourceInfo(file: File | null, crop: Crop | null): SourceInfo | null {
  const [base, setBase] = useState<FileInfo | null>(null);
  const [info, setInfo] = useState<SourceInfo | null>(null);
  useEffect(() => {
    setBase(null);
    setInfo(null);
    if (!file) return;
    let stale = false;
    void (async () => {
      const { ALL_FORMATS, BlobSource, Input } = await import("mediabunny");
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      try {
        const [track, audio, duration] = await Promise.all([
          input.getPrimaryVideoTrack(),
          input.getPrimaryAudioTrack(),
          input.computeDuration(),
        ]);
        // The render uses the displayed size, rounded to even numbers.
        const width = track ? track.displayWidth & ~1 : AUDIO_VIDEO.width;
        const height = track ? track.displayHeight & ~1 : AUDIO_VIDEO.height;
        // A few thousand packets are enough for an average and stay quick on files without an index.
        const [videoStats, decodes, audioStats] = await Promise.all([
          track?.computePacketStats(3000),
          track?.canDecode().catch(() => false),
          audio?.computePacketStats(3000),
        ]);
        if (stale) return;
        setBase({
          width,
          height,
          // For video, packets per second is the frame rate.
          fps: videoStats?.averagePacketRate || AUDIO_VIDEO.fps,
          duration,
          video:
            track && videoStats
              ? { bitrate: videoStats.averageBitrate, codec: track.codec, decodes: !!decodes, width, height }
              : null,
          // Recordings and audio files are re-encoded to AAC at about 192 kbps.
          audioBitrate: track ? (audioStats?.averageBitrate ?? 0) : 192_000,
        });
      } catch {
        // Unreadable here: the menu shows no estimate and the render reports the problem.
      } finally {
        input.dispose();
      }
    })();
    return () => {
      stale = true;
    };
  }, [file]);

  // The picture as exported: the crop's frame for a video, else the whole picture.
  const frame = base?.video && crop ? framing(crop, base.width, base.height) : null;
  const width = frame && !frame.none ? frame.size.width : (base?.width ?? 0);
  const height = frame && !frame.none ? frame.size.height : (base?.height ?? 0);
  const ratio = frame && !frame.none ? frame.ratio : width / height;

  // The sizes on offer again when the crop changes size; the last ones stay until then.
  useEffect(() => {
    if (!base) return;
    let stale = false;
    void (async () => {
      const { canEncodeVideo } = await import("mediabunny");
      const resolutions = await Promise.all(
        resolutionSizes(width, height, !!base.video, ratio).map(async (r) => {
          const [avc, hevc] = await Promise.all([
            encoder(canEncodeVideo, "avc", r.width, r.height),
            encoder(canEncodeVideo, "hevc", r.width, r.height),
          ]);
          return { ...r, encoders: { avc, hevc } };
        }),
      );
      if (!stale) setInfo({ ...base, width, height, resolutions });
    })();
    return () => {
      stale = true;
    };
  }, [base, width, height, ratio]);
  return info;
}
