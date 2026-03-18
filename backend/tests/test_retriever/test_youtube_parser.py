from agents.retriever.parsers.youtube_parser import _clean_caption_text


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
