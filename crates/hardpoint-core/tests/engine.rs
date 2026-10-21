//! End-to-end tests against a fake DCS install + Saved Games folder.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use hardpoint_core::engine::{Config, Engine, ImportOptions};
use hardpoint_core::error::Error;
use hardpoint_core::hub::HubIndex;
use hardpoint_core::{Mapping, Target};

struct Rig {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    install: PathBuf,
    saved: PathBuf,
    data: PathBuf,
}

impl Rig {
    fn new() -> Self {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().to_path_buf();
        let install = root.join("DCS World");
        let saved = root.join("Saved Games/DCS");
        fs::create_dir_all(install.join("bin")).unwrap();
        fs::create_dir_all(install.join("CoreMods")).unwrap();
        fs::write(install.join("bin/DCS.exe"), b"exe").unwrap();
        fs::write(install.join("autoupdate.cfg"), br#"{"version": "2.9.20.1000", "branch": "release"}"#).unwrap();
        fs::create_dir_all(install.join("Bazar/shaders")).unwrap();
        fs::write(install.join("Bazar/shaders/clouds.fx"), b"vanilla clouds").unwrap();
        fs::create_dir_all(saved.join("Config")).unwrap();
        let data = root.join("data");
        Rig { _tmp: tmp, root, install, saved, data }
    }

    fn engine(&self) -> Engine {
        let mut e = Engine::open(&self.data).unwrap();
        e.set_config(Config {
            install_dir: Some(self.install.clone()),
            saved_dir: Some(self.saved.clone()),
            index_url: "unused".into(),
        })
        .unwrap();
        e
    }

    fn zip(&self, name: &str, files: &[(&str, &[u8])]) -> PathBuf {
        let p = self.root.join(name);
        let mut z = zip::ZipWriter::new(fs::File::create(&p).unwrap());
        let opts = zip::write::SimpleFileOptions::default();
        for (n, data) in files {
            z.start_file(*n, opts).unwrap();
            z.write_all(data).unwrap();
        }
        z.finish().unwrap();
        p
    }
}

fn read(p: &Path) -> String {
    fs::read_to_string(p).unwrap()
}

#[test]
fn saved_games_mod_round_trip() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip(
        "A-4E-C v2.2.zip",
        &[
            ("A-4E-C/entry.lua", b"declare_plugin()"),
            ("A-4E-C/Cockpit/Scripts/device_init.lua", b"-- devices"),
            ("A-4E-C Manual.pdf", b"%PDF"),
        ],
    );
    let rec = e.import(&zip, ImportOptions { enable: true, ..Default::default() }).unwrap();
    assert_eq!(rec.id, "a-4e-c-v2-2");
    assert!(rec.enabled);
    assert!(!rec.writes_install_dir());
    let entry = rig.saved.join("Mods/aircraft/A-4E-C/entry.lua");
    assert_eq!(read(&entry), "declare_plugin()");
    assert!(!rig.saved.join("A-4E-C Manual.pdf").exists());

    let health = e.verify().unwrap();
    assert!(health[0].healthy());

    let r = e.disable(&rec.id).unwrap();
    assert_eq!(r.removed, 2);
    assert!(!entry.exists());
    // Folders we created are gone; folders that existed stay.
    assert!(!rig.saved.join("Mods").exists());
    assert!(rig.saved.join("Config").exists());

    // Survives a restart.
    drop(e);
    let mut e = rig.engine();
    assert_eq!(e.list().len(), 1);
    e.enable(&rec.id).unwrap();
    assert!(entry.exists());
    e.remove(&rec.id).unwrap();
    assert!(!entry.exists());
    assert!(e.list().is_empty());
    assert!(!rig.data.join("library").join(&rec.id).exists());
}

#[test]
fn install_dir_mod_backs_up_and_restores() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip("Better Clouds.zip", &[("Bazar/shaders/clouds.fx", b"modded clouds"), ("README.txt", b"hi")]);
    let rec = e.import(&zip, ImportOptions { enable: true, ..Default::default() }).unwrap();
    assert!(rec.writes_install_dir());
    let clouds = rig.install.join("Bazar/shaders/clouds.fx");
    assert_eq!(read(&clouds), "modded clouds");
    assert!(!rig.install.join("README.txt").exists(), "readmes are not copied into DCS");

    e.disable(&rec.id).unwrap();
    assert_eq!(read(&clouds), "vanilla clouds");
    assert!(!rig.data.join("backups").join(&rec.id).exists());
}

#[test]
fn conflicts_are_refused() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let a = rig.zip("clouds-a.zip", &[("Bazar/shaders/clouds.fx", b"A")]);
    let b = rig.zip("clouds-b.zip", &[("Bazar/shaders/clouds.fx", b"B")]);
    e.import(&a, ImportOptions { enable: true, ..Default::default() }).unwrap();
    let rb = e.import(&b, ImportOptions::default()).unwrap();
    match e.enable(&rb.id) {
        Err(Error::Conflicts(c)) => {
            assert_eq!(c.len(), 1);
            assert_eq!(c[0].owner, "clouds-a");
        }
        other => panic!("expected conflict, got {other:?}"),
    }
    assert_eq!(read(&rig.install.join("Bazar/shaders/clouds.fx")), "A");
}

#[test]
fn dcs_update_then_repair_then_disable() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip("clouds.zip", &[("Bazar/shaders/clouds.fx", b"modded")]);
    let rec = e.import(&zip, ImportOptions { enable: true, ..Default::default() }).unwrap();
    let clouds = rig.install.join("Bazar/shaders/clouds.fx");

    // A DCS update ships a new vanilla file and bumps the version.
    fs::write(&clouds, b"vanilla clouds 2.9.21").unwrap();
    fs::write(rig.install.join("autoupdate.cfg"), br#"{"version": "2.9.21.500"}"#).unwrap();
    let h = &e.verify().unwrap()[0];
    assert_eq!(h.changed.len(), 1);
    assert!(h.dcs_updated);

    e.repair(&rec.id).unwrap();
    assert_eq!(read(&clouds), "modded");
    assert!(e.verify().unwrap()[0].healthy());

    // Disabling now restores the *new* vanilla file, not the stale one.
    e.disable(&rec.id).unwrap();
    assert_eq!(read(&clouds), "vanilla clouds 2.9.21");
    assert!(rig.data.join("orphaned").exists(), "stale backup is kept, not deleted");
}

#[test]
fn user_edited_file_is_left_alone() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip("script.zip", &[("Scripts/Hooks/myhook.lua", b"v1")]);
    let rec = e.import(&zip, ImportOptions { enable: true, ..Default::default() }).unwrap();
    let hook = rig.saved.join("Scripts/Hooks/myhook.lua");
    fs::write(&hook, b"user tweaked").unwrap();
    let r = e.disable(&rec.id).unwrap();
    assert_eq!(r.kept_changed.len(), 1);
    assert_eq!(read(&hook), "user tweaked");
}

#[test]
fn explicit_rules_and_liveries() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip(
        "saaf-liveries.zip",
        &[("2 Sqn/description.lua", b"livery = {}"), ("85 AFS/description.lua", b"livery = {}")],
    );
    let rec = e
        .import(
            &zip,
            ImportOptions { livery_for: Some("F-16C_50".into()), enable: true, ..Default::default() },
        )
        .unwrap();
    assert_eq!(rec.mappings.len(), 2);
    assert!(rig.saved.join("Liveries/F-16C_50/2 Sqn/description.lua").exists());

    let zip2 = rig.zip("odd.zip", &[("stuff/thing.lua", b"x")]);
    assert!(matches!(e.import(&zip2, ImportOptions::default()), Err(Error::AmbiguousLayout(_))));
    let rec2 = e
        .import(
            &zip2,
            ImportOptions {
                mappings: vec![Mapping { from: "stuff".into(), to: Target::parse("saved:Scripts/odd").unwrap() }],
                enable: true,
                ..Default::default()
            },
        )
        .unwrap();
    assert!(rig.saved.join("Scripts/odd/thing.lua").exists());
    assert!(!rec2.writes_install_dir());
}

#[test]
fn zip_slip_is_rejected() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let zip = rig.zip("evil.zip", &[("../../escaped.txt", b"pwned")]);
    let err = e.import(&zip, ImportOptions::default()).unwrap_err();
    assert!(matches!(err, Error::UnsafePath(_)), "{err:?}");
    assert!(!rig.root.join("escaped.txt").exists());
}

#[test]
fn seven_zip_and_folder_imports() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let src = rig.root.join("src7z/Mods/tech/Thing");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("entry.lua"), b"tech").unwrap();
    let archive = rig.root.join("thing.7z");
    sevenz_rust2::compress_to_path(rig.root.join("src7z"), &archive).unwrap();
    e.import(&archive, ImportOptions { enable: true, ..Default::default() }).unwrap();
    assert!(rig.saved.join("Mods/tech/Thing/entry.lua").exists());

    let folder = rig.root.join("Kneeboards");
    fs::create_dir_all(folder.join("Kneeboard/F-16C_50")).unwrap();
    fs::write(folder.join("Kneeboard/F-16C_50/01.png"), b"png").unwrap();
    e.import(&folder, ImportOptions { enable: true, ..Default::default() }).unwrap();
    assert!(rig.saved.join("Kneeboard/F-16C_50/01.png").exists());
}

#[test]
fn rar_gets_a_helpful_error() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let p = rig.root.join("x.rar");
    fs::write(&p, b"Rar!\x1a\x07\x00rest").unwrap();
    let err = e.import(&p, ImportOptions::default()).unwrap_err();
    assert!(err.to_string().contains("7-Zip"));
}

#[test]
fn reimport_new_version_redeploys() {
    let rig = Rig::new();
    let mut e = rig.engine();
    let v1 = rig.zip("m.zip", &[("Scripts/m.lua", b"v1"), ("Scripts/old.lua", b"old")]);
    let v2 = rig.zip("m2.zip", &[("Scripts/m.lua", b"v2")]);
    e.import(&v1, ImportOptions { id: Some("m".into()), version: Some("1.0".into()), enable: true, ..Default::default() })
        .unwrap();
    let r = e
        .import(&v2, ImportOptions { id: Some("m".into()), version: Some("1.1".into()), ..Default::default() })
        .unwrap();
    assert!(r.enabled, "stays enabled across an update");
    assert_eq!(r.version, "1.1");
    assert_eq!(read(&rig.saved.join("Scripts/m.lua")), "v2");
    assert!(!rig.saved.join("Scripts/old.lua").exists(), "files dropped in the new version are removed");
}

#[test]
fn interrupted_deploy_is_rolled_back_on_next_start() {
    let rig = Rig::new();
    let e = rig.engine();
    drop(e);
    // Simulate a crash half-way through deploying "x": one new file written,
    // one existing file moved to backup and overwritten, journal left behind.
    let new_file = rig.saved.join("Scripts/x/new.lua");
    fs::create_dir_all(new_file.parent().unwrap()).unwrap();
    fs::write(&new_file, b"partial").unwrap();
    let clouds = rig.install.join("Bazar/shaders/clouds.fx");
    let backup = rig.data.join("backups/x/install/Bazar/shaders/clouds.fx");
    fs::create_dir_all(backup.parent().unwrap()).unwrap();
    fs::rename(&clouds, &backup).unwrap();
    fs::write(&clouds, b"half-written").unwrap();
    fs::write(
        rig.data.join("journal.json"),
        r#"{"mod_id":"x","entries":[
            {"target":"saved:Scripts/x/new.lua","existed":false},
            {"target":"install:Bazar/shaders/clouds.fx","existed":true}],
           "created_dirs":["saved:Scripts","saved:Scripts/x"]}"#,
    )
    .unwrap();

    let _e = rig.engine();
    assert!(!new_file.exists());
    assert!(!rig.saved.join("Scripts").exists());
    assert_eq!(read(&clouds), "vanilla clouds");
    assert!(!rig.data.join("journal.json").exists());
}

#[test]
fn hub_index_helpers() {
    let idx = HubIndex::parse(
        r#"{"schema":1,"mods":[
          {"id":"lib","name":"Lib","summary":"s","category":"script","authors":[{"name":"a"}],
           "releases":[{"version":"1.0","date":"2026-01-01","download":{"kind":"direct","url":"https://x/lib.zip","sha256":"ABC"}}]},
          {"id":"app","name":"App","summary":"s","category":"aircraft","authors":[{"name":"a"}],
           "dependencies":[{"id":"lib"}],
           "releases":[
             {"version":"1.9","date":"2026-01-01","download":{"kind":"page","url":"https://x"}},
             {"version":"1.10","date":"2026-02-01","download":{"kind":"page","url":"https://x"},
              "install":[{"from":"App","to":"saved:Mods/aircraft/App"}]}]},
          {"id":"loop-a","name":"A","summary":"s","category":"other","authors":[],"dependencies":[{"id":"loop-b"}],"releases":[]},
          {"id":"loop-b","name":"B","summary":"s","category":"weird-new-category","authors":[],"dependencies":[{"id":"loop-a"}],"releases":[]}
        ]}"#,
    )
    .unwrap();
    assert_eq!(idx.get("app").unwrap().latest().unwrap().version, "1.10");
    assert_eq!(idx.get("app").unwrap().latest().unwrap().writes_install_dir(), Some(false));
    assert_eq!(idx.install_order("app").unwrap(), vec!["lib", "app"]);
    assert!(matches!(idx.install_order("loop-a"), Err(Error::DependencyCycle(_))));
    assert_eq!(idx.match_sha256("abc").unwrap().0.id, "lib");
}
