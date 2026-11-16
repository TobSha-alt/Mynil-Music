import Cocoa
import WebKit
import MediaPlayer

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var statusItem: NSStatusItem?
    var serverProcess: Process?
    var serverPort: Int = 0

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()
        setupStatusBarMiniPlayer()
        setupRemoteMediaKeys()
        startBackendAndLaunch()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopBackend()
    }

    func resolveProjectRoot() -> String {
        if let envRoot = ProcessInfo.processInfo.environment["SONA_ROOT"], !envRoot.isEmpty {
            return envRoot
        }
        if let resPath = Bundle.main.resourcePath,
           FileManager.default.fileExists(atPath: resPath + "/backend/server.js") {
            return resPath
        }
        // Sona.app sits directly inside the sona project folder
        let bundleDir = Bundle.main.bundleURL.deletingLastPathComponent().path
        if FileManager.default.fileExists(atPath: bundleDir + "/backend/server.js") {
            return bundleDir
        }
        return FileManager.default.currentDirectoryPath
    }

    func findNodeBinary() -> String {
        let candidates = [
            "/opt/homebrew/opt/node@22/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        return "/usr/bin/env"
    }

    func startBackendAndLaunch() {
        let root = resolveProjectRoot()
        let serverScript = root + "/backend/server.js"
        let nodePath = findNodeBinary()

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: nodePath)
        proc.arguments = nodePath == "/usr/bin/env" ? ["node", serverScript] : [serverScript]
        proc.currentDirectoryURL = URL(fileURLWithPath: root)

        var env = ProcessInfo.processInfo.environment
        let extraPath = "/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/Library/Frameworks/Python.framework/Versions/3.14/bin"
        env["PATH"] = extraPath + ":" + (env["PATH"] ?? "/usr/bin:/bin")
        env["SONA_PORT"] = "0"
        proc.environment = env

        let stdoutPipe = Pipe()
        proc.standardOutput = stdoutPipe
        proc.standardError = FileHandle.standardError

        let readySem = DispatchSemaphore(value: 0)
        var launched = false

        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let str = String(data: data, encoding: .utf8) else { return }
            if !launched, let range = str.range(of: #"SONA_READY:(\d+)"#, options: .regularExpression) {
                let matched = String(str[range])
                if let port = Int(matched.replacingOccurrences(of: "SONA_READY:", with: "")) {
                    launched = true
                    self?.serverPort = port
                    readySem.signal()
                }
            }
        }

        do {
            try proc.run()
            self.serverProcess = proc
        } catch {
            showFatalError("Could not start Sona backend: \(error.localizedDescription)")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            _ = readySem.wait(timeout: .now() + 8.0)
            DispatchQueue.main.async {
                guard let self = self, self.serverPort > 0 else {
                    self?.showFatalError("Sona server failed to bind a local port.")
                    return
                }
                self.createWindow(port: self.serverPort)
            }
        }
    }

    func stopBackend() {
        if let proc = serverProcess, proc.isRunning {
            proc.terminate()
        }
        serverProcess = nil
    }

    func createWindow(port: Int) {
        let frame = NSRect(x: 0, y: 0, width: 1420, height: 900)
        window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        let appName = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "Mynil Music"
        window.title = appName
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = NSColor(red: 0.027, green: 0.027, blue: 0.043, alpha: 1.0)
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 1140, height: 720)
        window.contentMinSize = NSSize(width: 1140, height: 720)
        window.delegate = self
        window.center()

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.preferences.isElementFullscreenEnabled = true
        config.preferences.setValue(false, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: frame, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = self
        webView.uiDelegate = self

        window.contentView = webView
        if let url = URL(string: "http://127.0.0.1:\(port)/") {
            webView.load(URLRequest(url: url))
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showFatalError(_ msg: String) {
        let alert = NSAlert()
        alert.messageText = "Mynil Music Launch Error"
        alert.informativeText = msg
        alert.alertStyle = .critical
        alert.runModal()
        NSApp.terminate(nil)
    }

    func setupMainMenu() {
        let mainMenu = NSMenu()

        let appName = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "Mynil Music"
        // App Menu
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        // Edit Menu (enables Cmd+C/V/X/A in search inputs)
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        // View Menu
        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "View")
        let reloadItem = NSMenuItem(title: "Reload", action: #selector(reloadWebView), keyEquivalent: "r")
        reloadItem.target = self
        viewMenu.addItem(reloadItem)
        viewMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewMenuItem.submenu = viewMenu

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadWebView() {
        webView?.reload()
    }

    func dispatchMediaKey(_ action: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('mynil-media-key', { detail: '\(action)' }));", completionHandler: nil)
        }
    }

    func setupStatusBarMiniPlayer() {
        let appName = (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ?? "Mynil Music"
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "♫"
        item.button?.toolTip = appName
        let menu = NSMenu()
        let playItem = NSMenuItem(title: "Play / Pause", action: #selector(menuPlayPause), keyEquivalent: "")
        playItem.target = self
        menu.addItem(playItem)
        let nextItem = NSMenuItem(title: "Next Track", action: #selector(menuNext), keyEquivalent: "")
        nextItem.target = self
        menu.addItem(nextItem)
        let prevItem = NSMenuItem(title: "Previous Track", action: #selector(menuPrev), keyEquivalent: "")
        prevItem.target = self
        menu.addItem(prevItem)
        menu.addItem(NSMenuItem.separator())
        let showItem = NSMenuItem(title: "Show \(appName)", action: #selector(menuShowApp), keyEquivalent: "")
        showItem.target = self
        menu.addItem(showItem)
        menu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.menu = menu
        self.statusItem = item
    }

    func setupRemoteMediaKeys() {
        let center = MPRemoteCommandCenter.shared()
        center.togglePlayPauseCommand.isEnabled = true
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            self?.dispatchMediaKey("playpause")
            return .success
        }
        center.nextTrackCommand.isEnabled = true
        center.nextTrackCommand.addTarget { [weak self] _ in
            self?.dispatchMediaKey("next")
            return .success
        }
        center.previousTrackCommand.isEnabled = true
        center.previousTrackCommand.addTarget { [weak self] _ in
            self?.dispatchMediaKey("prev")
            return .success
        }
    }

    @objc func menuPlayPause() { dispatchMediaKey("playpause") }
    @objc func menuNext() { dispatchMediaKey("next") }
    @objc func menuPrev() { dispatchMediaKey("prev") }
    @objc func menuShowApp() {
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
