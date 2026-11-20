import UIKit
import Capacitor
import AVFoundation
import SQLite3

/// Copies the game's save out of the web view's storage file before the web view opens it.
///
/// The collection lives in the web view's local storage, and the web view is the only thing
/// that normally reads it. When the web view answers "nothing here" on a launch where there
/// was something, the game used to believe it. This reads the same file directly, first, and
/// leaves what it finds in the app's preferences, where src/game/keeper.ts looks for a backup
/// before it will start a new game. It runs on every launch, including the first launch of
/// the build that introduced it, which is the launch nothing else can protect.
///
/// Read-only and best-effort throughout: anything that goes wrong here leaves things exactly
/// as they were, and the app launches regardless.
enum SavePreflight {
    static let saveKey = "squishbox.save.v1"
    /// Read by the web app as the Preferences key "squishbox.preflight".
    static let defaultsKey = "CapacitorStorage.squishbox.preflight"

    static func run() {
        guard let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return }
        let root = library.appendingPathComponent("WebKit", isDirectory: true)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return }
        var found: [String] = []
        for case let url as URL in walker {
            let name = url.lastPathComponent
            guard name == "localstorage.sqlite3" || name.hasSuffix(".localstorage") else { continue }
            if let text = read(url), !text.isEmpty, !found.contains(text) { found.append(text) }
        }
        // Nothing found is not a reason to forget what was found last time: that earlier
        // copy is the whole point.
        guard !found.isEmpty,
              let data = try? JSONSerialization.data(withJSONObject: found),
              let json = String(data: data, encoding: .utf8) else { return }
        let defaults = UserDefaults.standard
        if defaults.string(forKey: defaultsKey) != json { defaults.set(json, forKey: defaultsKey) }
    }

    private static func read(_ url: URL) -> String? {
        var db: OpaquePointer?
        defer { sqlite3_close(db) }
        guard sqlite3_open_v2(url.path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK else { return nil }
        sqlite3_busy_timeout(db, 200)
        var statement: OpaquePointer?
        defer { sqlite3_finalize(statement) }
        guard sqlite3_prepare_v2(db, "SELECT value FROM ItemTable WHERE key = ?1", -1, &statement, nil) == SQLITE_OK else { return nil }
        let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
        guard sqlite3_bind_text(statement, 1, saveKey, -1, transient) == SQLITE_OK,
              sqlite3_step(statement) == SQLITE_ROW else { return nil }
        // WebKit stores values as UTF-16 blobs; older files held plain text.
        if sqlite3_column_type(statement, 0) == SQLITE_TEXT {
            guard let text = sqlite3_column_text(statement, 0) else { return nil }
            return String(cString: text)
        }
        let count = Int(sqlite3_column_bytes(statement, 0))
        guard count > 0, let bytes = sqlite3_column_blob(statement, 0) else { return nil }
        return String(data: Data(bytes: bytes, count: count), encoding: .utf16LittleEndian)
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        SavePreflight.run() // before the web view exists, so before anything else has touched the file
        configureAudioSession()
        return true
    }

    /// The game's squeaks and chimes are WebAudio, so they run through this app's audio session.
    /// Without setting a category we inherit the default, soloAmbient, which stops whatever the
    /// grown-up was already listening to the moment a child opens the app.
    ///
    /// .ambient instead: mixes with other audio, so a podcast or music keeps playing underneath.
    /// Both categories stay silent when the Ring/Silent switch is flipped, which is deliberate —
    /// a parent who mutes their phone in a waiting room means it, and .playback would talk over
    /// that. If the app is ever silent when it shouldn't be, check that switch first.
    private func configureAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            // Sound is a nice-to-have; never let it stop the app from launching.
            NSLog("Squishbox: audio session setup failed: \(error.localizedDescription)")
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
