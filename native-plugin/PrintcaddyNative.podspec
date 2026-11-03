Pod::Spec.new do |s|
  s.name = 'PrintcaddyNative'
  s.version = '1.0.0'
  s.summary = 'PrintCaddy native iOS helpers'
  s.license = 'AGPL-3.0'
  s.homepage = 'https://github.com/rrkennedy69/printcaddy-ios'
  s.author = 'rrkennedy69'
  s.source = { :git => 'https://github.com/rrkennedy69/printcaddy-ios.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '15.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
