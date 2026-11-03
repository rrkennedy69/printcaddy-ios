import json, sys, datetime
tag, ver, size, web = sys.argv[1:5]
repo = "rrkennedy69/printcaddy-ios"
print(json.dumps({
  "name": "PrintCaddy", "identifier": "com.rrkennedy.printcaddy.source",
  "sourceURL": f"https://github.com/{repo}/releases/latest/download/apps.json",
  "apps": [{
    "name": "PrintCaddy", "bundleIdentifier": "com.rrkennedy.printcaddy", "developerName": "rrkennedy69",
    "subtitle": "3D-print CAD for iPad", "localizedDescription": "PrintCaddy web CAD as an iPad app.",
    "iconURL": f"https://raw.githubusercontent.com/{repo}/main/resources/icon-1024.png",
    "versions": [{"version": ver, "date": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
      "localizedDescription": f"Web build {web}", "downloadURL": f"https://github.com/{repo}/releases/download/{tag}/PrintCaddy.ipa",
      "size": int(size), "minOSVersion": "15.0"}],
    "version": ver, "downloadURL": f"https://github.com/{repo}/releases/download/{tag}/PrintCaddy.ipa", "size": int(size),
  }],
}, indent=2))
