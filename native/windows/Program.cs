using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Sona;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new SonaForm());
    }
}

internal sealed class SonaForm : Form
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_CAPTION_COLOR = 35;

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    private readonly WebView2 _webView;
    private Process? _serverProcess;
    private bool _isFullScreen;
    private FormBorderStyle _savedBorderStyle;
    private FormWindowState _savedWindowState;
    private Rectangle _savedBounds;

    public SonaForm()
    {
        var baseDir = AppContext.BaseDirectory ?? "";
        Text = baseDir.Contains("Mono", StringComparison.OrdinalIgnoreCase) ? "Mynil Mono" : "Mynil Music";
        Width = 1420;
        Height = 900;
        MinimumSize = new Size(1020, 680);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(7, 7, 11);

        try
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        }
        catch { }

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(7, 7, 11),
        };
        Controls.Add(_webView);

        Load += async (_, _) => await StartBackendAndLaunchAsync();
        FormClosing += (_, _) => StopBackend();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            int dark = 1;
            DwmSetWindowAttribute(Handle, DWMWA_USE_IMMERSIVE_DARK_MODE, ref dark, sizeof(int));
            int captionColor = 0x0B0707; // BGR for #07070b
            DwmSetWindowAttribute(Handle, DWMWA_CAPTION_COLOR, ref captionColor, sizeof(int));
        }
        catch { }
    }

    private static string ResolveProjectRoot()
    {
        var envRoot = Environment.GetEnvironmentVariable("SONA_ROOT");
        if (!string.IsNullOrWhiteSpace(envRoot) && File.Exists(Path.Combine(envRoot, "backend", "server.js")))
        {
            return envRoot;
        }

        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "backend", "server.js")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }

        return Directory.GetCurrentDirectory();
    }

    private static string FindNodeBinary()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"),
            "node.exe",
        };

        foreach (var path in candidates)
        {
            if (path == "node.exe" || File.Exists(path))
            {
                return path;
            }
        }
        return "node.exe";
    }

    private async Task StartBackendAndLaunchAsync()
    {
        var root = ResolveProjectRoot();
        var serverScript = Path.Combine(root, "backend", "server.js");
        if (!File.Exists(serverScript))
        {
            ShowFatal($"Could not find Mynil Music backend at:\n{serverScript}");
            return;
        }

        var psi = new ProcessStartInfo
        {
            FileName = FindNodeBinary(),
            Arguments = $"\"{serverScript}\"",
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.Environment["SONA_PORT"] = "0";

        var readyTcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
        var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };

        proc.OutputDataReceived += (_, args) =>
        {
            if (string.IsNullOrEmpty(args.Data)) return;
            var match = Regex.Match(args.Data, @"SONA_READY:(\d+)");
            if (match.Success && int.TryParse(match.Groups[1].Value, out var port))
            {
                readyTcs.TrySetResult(port);
            }
        };

        try
        {
            proc.Start();
            _serverProcess = proc;
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            ShowFatal($"Could not start Mynil Music backend:\n{ex.Message}");
            return;
        }

        var timeoutTask = Task.Delay(TimeSpan.FromSeconds(10));
        var completed = await Task.WhenAny(readyTcs.Task, timeoutTask);
        if (completed != readyTcs.Task)
        {
            ShowFatal("Mynil Music server failed to bind a local port within 10 seconds.");
            return;
        }

        var serverPort = await readyTcs.Task;

        try
        {
            var userDataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Sona",
                "WebView2");
            Directory.CreateDirectory(userDataDir);

            var options = new CoreWebView2EnvironmentOptions("--autoplay-policy=no-user-gesture-required");
            var env = await CoreWebView2Environment.CreateAsync(null, userDataDir, options);
            await _webView.EnsureCoreWebView2Async(env);

            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.ContainsFullScreenElementChanged += (_, _) =>
            {
                SetFullScreen(_webView.CoreWebView2.ContainsFullScreenElement);
            };
            _webView.KeyDown += (_, e) =>
            {
                if (e.KeyCode == Keys.F11)
                {
                    e.Handled = true;
                    SetFullScreen(!_isFullScreen);
                }
                else if (e.KeyCode == Keys.Escape && _isFullScreen && !_webView.CoreWebView2.ContainsFullScreenElement)
                {
                    e.Handled = true;
                    SetFullScreen(false);
                }
            };
            _webView.CoreWebView2.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                try
                {
                    Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
                }
                catch { }
            };

            _webView.Source = new Uri($"http://127.0.0.1:{serverPort}/");
        }
        catch (Exception ex)
        {
            ShowFatal($"Failed to initialize WebView2:\n{ex.Message}");
        }
    }

    private void SetFullScreen(bool fullScreen)
    {
        if (_isFullScreen == fullScreen) return;
        _isFullScreen = fullScreen;

        if (fullScreen)
        {
            _savedBorderStyle = FormBorderStyle;
            _savedWindowState = WindowState;
            _savedBounds = Bounds;

            var screenBounds = Screen.FromControl(this).Bounds;
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            Bounds = screenBounds;
            WindowState = FormWindowState.Maximized;
            Activate();
        }
        else
        {
            WindowState = FormWindowState.Normal;
            FormBorderStyle = _savedBorderStyle == FormBorderStyle.None ? FormBorderStyle.Sizable : _savedBorderStyle;
            if (!_savedBounds.IsEmpty)
            {
                Bounds = _savedBounds;
            }
            WindowState = _savedWindowState == FormWindowState.Maximized ? FormWindowState.Normal : _savedWindowState;
        }
    }

    private void StopBackend()
    {
        try
        {
            if (_serverProcess is { HasExited: false })
            {
                _serverProcess.Kill(entireProcessTree: true);
            }
        }
        catch { }
        _serverProcess = null;
    }

    private void ShowFatal(string message)
    {
        StopBackend();
        MessageBox.Show(this, message, "Mynil Music Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
        Close();
    }
}
