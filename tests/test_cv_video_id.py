from src.cv_video_id import normalize_cv_video_id


def test_normalize_plain_id() -> None:
    assert normalize_cv_video_id("  TURPRM1220_WED-18_8-9(M8L2)  ") == "TURPRM1220_WED-18_8-9(M8L2)"


def test_normalize_strips_mp4() -> None:
    assert normalize_cv_video_id("TURPRM1220_WED-18_8-9(M8L2).mp4") == "TURPRM1220_WED-18_8-9(M8L2)"


def test_normalize_gs_uri() -> None:
    u = "gs://lectureai_full_videos/Lesson_Records/TURPRM1220_WED-18_8-9(M8L2).mp4"
    assert normalize_cv_video_id(u) == "TURPRM1220_WED-18_8-9(M8L2)"


def test_normalize_prefix_path() -> None:
    p = "lectureai_full_videos/Lesson_Records/TURPRM1220_WED-18_8-9(M8L2)"
    assert normalize_cv_video_id(p) == "TURPRM1220_WED-18_8-9(M8L2)"
