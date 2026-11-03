import Foundation
import Capacitor
import UIKit
import WebKit
import AuthenticationServices

/// Native helpers for the PrintCaddy iPad app. JS name: PrintCaddyNative.
@objc(PrintCaddyNativePlugin)
public class PrintCaddyNativePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "PrintCaddyNativePlugin"
    public let jsName = "PrintCaddyNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "provisioning", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]
    private var exportCall: CAPPluginCall?
    private var authSession: ASWebAuthenticationSession?

    override public func load() {
        DispatchQueue.main.async { self.tuneWebView() }
    }

    /// App-like web view: no rubber-band bounce, no pull gestures, no link previews, no back/forward swipes.
    private func tuneWebView() {
        guard let wv = bridge?.webView else { return }
        wv.scrollView.bounces = false
        wv.scrollView.alwaysBounceVertical = false
        wv.scrollView.alwaysBounceHorizontal = false
        wv.scrollView.refreshControl = nil
        wv.allowsLinkPreview = false
        wv.allowsBackForwardNavigationGestures = false
        wv.isOpaque = true
        if #available(iOS 16.4, *) { wv.isInspectable = true }
    }

    /// Expiry of the signing profile (Sideloadly / free Apple ID profiles last 7 days).
    @objc func provisioning(_ call: CAPPluginCall) {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),
              let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>"),
              let plist = try? PropertyListSerialization.propertyList(from: Data(String(text[start.lowerBound..<end.upperBound]).utf8), options: [], format: nil) as? [String: Any]
        else { call.resolve(["found": false]); return }
        var result: [String: Any] = ["found": true]
        if let d = plist["ExpirationDate"] as? Date { result["expires"] = ISO8601DateFormatter().string(from: d) }
        if let d = plist["CreationDate"] as? Date { result["created"] = ISO8601DateFormatter().string(from: d) }
        if let n = plist["TeamName"] as? String { result["team"] = n }
        call.resolve(result)
    }

    /// Files app "Save to…" for a file the app already wrote (file:// URL).
    @objc func exportFile(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else { call.reject("url required"); return }
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            picker.delegate = self
            self.exportCall = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        exportCall?.resolve(["saved": true, "url": urls.first?.absoluteString ?? ""]); exportCall = nil
    }
    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        exportCall?.resolve(["saved": false]); exportCall = nil
    }

    /// System sign-in sheet (ASWebAuthenticationSession); resolves with the printcaddy:// callback URL.
    @objc func authenticate(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else { call.reject("url required"); return }
        let scheme = call.getString("callbackScheme") ?? "printcaddy"
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                self.authSession = nil
                if let callback = callback { call.resolve(["url": callback.absoluteString]); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { call.reject("cancelled", "cancelled"); return }
                call.reject(error?.localizedDescription ?? "failed")
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            if !session.start() { call.reject("could not start sign-in") }
        }
    }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
