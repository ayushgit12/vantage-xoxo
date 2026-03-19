from agents.retriever.parsers.youtube_parser import (
    _clean_caption_text,
    _extract_playlist_id,
    _extract_video_id,
)


def test_extract_video_id_from_watch_url() -> None:
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    assert _extract_video_id(url) == "dQw4w9WgXcQ"


def test_extract_playlist_id_from_playlist_url() -> None:
    url = "https://www.youtube.com/playlist?list=PL1234567890ABCDEF"
    assert _extract_playlist_id(url) == "PL1234567890ABCDEF"


def test_extract_playlist_id_from_watch_url_with_list() -> None:
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890ABCDEF"
    assert _extract_playlist_id(url) == "PL1234567890ABCDEF"


def test_clean_caption_text_from_vtt_like_input() -> None:
    raw = """WEBVTT

00:00:01.000 --> 00:00:03.000
Hello everyone

00:00:03.000 --> 00:00:05.000
Welcome to this video
"""

    cleaned = _clean_caption_text(raw)

    assert cleaned == "Hello everyone Welcome to this video"


def test_clean_caption_text_removes_markup_and_duplicate_lines() -> None:
    raw = """1
00:00:01,000 --> 00:00:02,000
<v Speaker>Hi &amp; welcome</v>

2
00:00:02,000 --> 00:00:03,000
Hi &amp; welcome
"""

    cleaned = _clean_caption_text(raw)

    assert cleaned == "Hi & welcome"
