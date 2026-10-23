import importlib.util
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('auto_deploy',Path(__file__).parents[1]/'scripts/auto_deploy.py')
deploy=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


@pytest.fixture
def layout(tmp_path,monkeypatch):
    legacy=tmp_path/'legacy';legacy.mkdir()
    base=tmp_path/'releases';base.mkdir()
    release=base/('a'*40);release.mkdir()
    for name in ('outputs','work'):
        (legacy/name).mkdir()
        (legacy/name/'existing.txt').write_text('persistent data')
    monkeypatch.setattr(deploy,'LEGACY',legacy)
    monkeypatch.setattr(deploy,'BASE',base)
    return legacy,release


def test_bind_shared_data_without_expanding_sandbox(layout,monkeypatch):
    legacy,release=layout
    (release/'outputs').symlink_to(legacy/'outputs')
    mounted=set();calls=[]
    monkeypatch.setattr(deploy,'is_mountpoint',lambda path:path in mounted)
    monkeypatch.setattr(deploy.os.path,'samefile',lambda source,target:target in mounted)
    def run(args):
        assert args[:3]==['sudo','mount','--bind']
        calls.append(args)
        mounted.add(args[-1])
    monkeypatch.setattr(deploy,'run',run)
    deploy.mount_runtime(release)
    deploy.mount_runtime(release)  # Reboot/startup hooks are safe to repeat.
    assert len(calls)==2
    for name in ('outputs','work'):
        assert not (release/name).is_symlink()
        assert (legacy/name/'existing.txt').read_text()=='persistent data'
        assert [*calls[0][:3],legacy/name,release/name] in calls


def test_runtime_mount_refuses_unexpected_symlink(layout,monkeypatch):
    legacy,release=layout
    (release/'outputs').symlink_to(legacy)
    with pytest.raises(ValueError,match='Unexpected runtime link'):
        deploy.mount_runtime(release)
    assert (release/'outputs').is_symlink()


def test_runtime_mount_refuses_to_hide_existing_release_data(layout,monkeypatch):
    legacy,release=layout
    (release/'outputs').mkdir()
    (release/'outputs'/'unpublished.txt').write_text('keep')
    monkeypatch.setattr(deploy,'is_mountpoint',lambda path:False)
    with pytest.raises(ValueError,match='nonempty'):
        deploy.mount_runtime(release)
    assert (release/'outputs'/'unpublished.txt').read_text()=='keep'


def test_runtime_mount_refuses_unmanaged_destination(layout):
    legacy,release=layout
    with pytest.raises(ValueError,match='managed release'):
        deploy.mount_runtime(release.parent)
    deploy.mount_runtime(legacy)  # Original deployment rollback needs no mounts.
