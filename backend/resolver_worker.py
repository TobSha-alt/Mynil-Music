#!/usr/bin/env python3
"""Persistent multi-threaded yt-dlp stream resolver for Sona."""

import json
import sys
import threading
from concurrent.futures import ThreadPoolExecutor

import yt_dlp

_thread_local = threading.local()
_write_lock = threading.Lock()


def get_ydl(client_mode="default"):
    key = f"ydl_{client_mode}"
    ydl = getattr(_thread_local, key, None)
    if ydl is None:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "nocheckcertificate": True,
            "socket_timeout": 12,
            "retries": 3,
            "fragment_retries": 3,
            "geo_bypass": True,
        }
        if client_mode == "fallback":
            opts["extractor_args"] = {"youtube": {"player_client": ["android_vr", "tv", "web"]}}
        ydl = yt_dlp.YoutubeDL(opts)
        setattr(_thread_local, key, ydl)
    return ydl


def pick_best_audio(formats):
    audios = [
        f
        for f in formats
        if f.get("url")
        and f.get("acodec") not in (None, "none")
        and f.get("vcodec") in (None, "none")
        and str(f.get("protocol", "")).startswith("http")
    ]
    if not audios:
        audios = [
            f
            for f in formats
            if f.get("url")
            and f.get("acodec") not in (None, "none")
            and str(f.get("protocol", "")).startswith("http")
        ]
    if not audios:
        return None

    def score(f):
        ext = f.get("ext", "")
        abr = f.get("abr") or f.get("tbr") or 0
        proto = str(f.get("protocol", ""))
        # Prefer direct https m4a (140/139) for lossless faststart remuxing
        is_direct = 1000 if proto == "https" else 0
        ext_bonus = 800 if ext == "m4a" else (300 if ext == "webm" else 0)
        return is_direct + ext_bonus + abr

    audios.sort(key=score, reverse=True)
    best = audios[0]
    ext = best.get("ext", "m4a")
    mime = "audio/mp4" if ext == "m4a" else ("audio/webm" if ext == "webm" else "audio/mpeg")
    return {
        "url": best["url"],
        "mime": mime,
        "ext": ext,
        "abr": best.get("abr"),
        "httpHeaders": best.get("http_headers") or {},
    }


def pick_best_video(formats):
    videos = [
        f
        for f in formats
        if f.get("url")
        and f.get("vcodec") not in (None, "none")
        and (str(f.get("protocol", "")) in ("m3u8_native", "https", "http"))
    ]
    if not videos:
        return None

    def score(f):
        proto = str(f.get("protocol", ""))
        ext = f.get("ext", "")
        vcodec = f.get("vcodec") or ""
        h = f.get("height") or 0
        if sys.platform == "darwin":
            # Apple WKWebView / AVFoundation plays H.264 HLS (.m3u8) with exact 1:1 duration and instant start
            proto_bonus = 2000 if proto == "m3u8_native" else 0
        else:
            # Windows WebView2 / Chromium plays direct HTTPS MP4/WebM natively (not HLS .m3u8)
            proto_bonus = 2000 if proto in ("https", "http") else -2000
        is_h264 = 1000 if "avc1" in vcodec else 0
        ext_bonus = 500 if ext == "mp4" else 0
        h_score = 400 if h == 720 else (350 if h == 1080 else (250 if h == 480 else min(h, 200)))
        return proto_bonus + is_h264 + ext_bonus + h_score

    videos.sort(key=score, reverse=True)
    best = videos[0]
    is_hls = best.get("protocol") == "m3u8_native"
    ext = best.get("ext", "mp4")
    mime = "application/vnd.apple.mpegurl" if is_hls else ("video/mp4" if ext == "mp4" else "video/webm")
    return {
        "url": best["url"],
        "mime": mime,
        "ext": ext,
        "isHls": is_hls,
        "height": best.get("height"),
        "httpHeaders": best.get("http_headers") or {},
    }


def resolve_video(video_id):
    info = None
    last_err = None
    for mode in ("default", "fallback"):
        try:
            ydl = get_ydl(mode)
            candidate = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            formats = (candidate or {}).get("formats") or []
            if pick_best_audio(formats) or pick_best_video(formats):
                info = candidate
                break
        except Exception as exc:
            last_err = exc
    if info is None:
        if last_err is not None:
            raise last_err
        raise RuntimeError(f"No playable formats found for {video_id}")
    formats = info.get("formats") or []
    audio = pick_best_audio(formats)
    video = pick_best_video(formats)
    if not audio and not video:
        raise RuntimeError(f"No playable audio or video formats for {video_id}")
    return {
        "videoId": video_id,
        "title": info.get("title"),
        "duration": info.get("duration") or 0,
        "audio": audio,
        "video": video,
    }


def emit(obj):
    line = json.dumps(obj, separators=(",", ":")) + "\n"
    with _write_lock:
        sys.stdout.write(line)
        sys.stdout.flush()


def handle_request(req):
    req_id = req.get("id")
    video_id = req.get("videoId")
    try:
        data = resolve_video(video_id)
        emit({"id": req_id, "ok": True, "data": data})
    except Exception as exc:
        emit({"id": req_id, "ok": False, "error": str(exc)})


def main():
    emit({"ready": True})
    with ThreadPoolExecutor(max_workers=6) as pool:
        for raw in sys.stdin:
            raw = raw.strip()
            if not raw:
                continue
            try:
                req = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if req.get("cmd") == "quit":
                break
            pool.submit(handle_request, req)


if __name__ == "__main__":
    main()
