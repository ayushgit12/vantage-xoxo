from agents.retriever.parsers.youtube_parser import _clean_caption_text, _is_playlist_url


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


def test_is_playlist_url_detects_list_parameter() -> None:
    """Test that playlist URLs with list parameter are detected."""
    assert _is_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxx")
    assert _is_playlist_url("https://www.youtube.com/playlist?list=PLxxxxx")


def test_is_playlist_url_rejects_single_videos() -> None:
    """Test that single video URLs are not detected as playlists."""
    assert not _is_playlist_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    assert not _is_playlist_url("https://youtu.be/dQw4w9WgXcQ")


def test_is_playlist_url_detects_direct_playlist_url() -> None:
    """Test that direct playlist URLs are detected."""
    assert _is_playlist_url("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")

