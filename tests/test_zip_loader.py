import zipfile

from trail_data_pipeline.loaders.zip_loader import discover_activity_files, load_zip_file


def test_discover_activity_files_detects_supported_and_unsupported(tmp_path):
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("activity.fit", b"fit")
        archive.writestr("nested/activity.tcx", "<xml />")
        archive.writestr("notes.txt", "ignore")

    supported, skipped = discover_activity_files(zip_path)

    assert supported == ["activity.fit", "nested/activity.tcx"]
    assert [item.path for item in skipped] == ["notes.txt"]
    assert skipped[0].reason == "unsupported_format:.txt"


def test_load_zip_file_ignores_unknown_formats(tmp_path):
    zip_path = tmp_path / "export.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("notes.txt", "ignore")

    loaded, skipped = load_zip_file(zip_path)

    assert loaded == []
    assert len(skipped) == 1
    assert skipped[0].reason == "unsupported_format:.txt"
