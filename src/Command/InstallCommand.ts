﻿///<reference path='ICommand.ts'/>
///<reference path='../System/Web/WebRequest.ts'/>
///<reference path='../System/IO/FileManager.ts'/>
///<reference path='../System/IO/DirectoryManager.ts'/>
///<reference path='../System/Console.ts'/>
///<reference path='../System/Uri.ts'/>

module Command {

    export class InstallCommand extends BaseCommand {
        public shortcut: string = "install";
        public usage: string = "Intall file definition. Use install* to map dependencies.";
        private _args: Array;
        private _cache: string[] = [];
        private _index: number = 0;

        private _withDep = false;

        constructor(public dataSource: DataSource.IDataSource, public cfg: Config) { super(); }

        public accept(args: Array): bool {
            return (args[2] == this.shortcut || args[2] == this.shortcut + '*') && args[3];
        }

        private print(lib: DataSource.Lib) {
            System.Console.write(lib.name + ' - ' + lib.description + '[');

            for (var j = 0; j < lib.versions.length; j++) {
                if (j > 0 && j < lib.versions.length) {
                    System.Console.write(',');
                }
                var ver = lib.versions[j];
                System.Console.write(ver.version);
            }

            System.Console.writeLine(']');
        }

        private match(key: string, name: string) {
            return name.toUpperCase() == key.toUpperCase();
        }

        private saveFile(name: string, content: string): void { 
            var sw = System.IO.FileManager.handle.createFile(name);
            sw.write(content);
            sw.flush();
            sw.close();
        }

        private normalizeGithubUrl(uri: UriParsedObject) {
            if (uri.host == 'github.com') {
                var parts = uri.directory.split('/');
                var repo = /*parts[1] + '_' +*/ parts[2];
                var ignore = '/' + parts[1] + '/' + parts[2] + '/' + parts[3] + '/' + parts[4];
                uri.directory = '/' + repo + uri.directory.substr(ignore.length);
            }
        }

        private save(url: string, name: string, version: string, key: string, content: string): void {
            var uri = Uri.parseUri(url);
            this.normalizeGithubUrl(uri);

            if(!System.IO.DirectoryManager.handle.directoryExists(this.cfg.localPath + uri.directory)) {
                System.IO.DirectoryManager.handle.createDirectory(this.cfg.localPath + uri.directory);
            }

            var fileNameWithoutExtension = this.cfg.localPath + uri.directory + name;// + "-" + version;

            this.saveFile(fileNameWithoutExtension + ".d.ts", content);
            System.Console.writeLine("\\-- " + name + "@" + version + " -> " + this.cfg.localPath + uri.directory);

            this.saveFile(fileNameWithoutExtension + ".d.key", key);
            System.Console.writeLine("     \\-- " + key + ".key");

            System.Console.writeLine("");
        }

        private find(key: string, libs: DataSource.Lib[]): DataSource.Lib { 
            for (var i = 0; i < libs.length; i++) {
                var lib = libs[i];
                if (this.match(lib.name, key)) {
                    return lib;
                }
            }

            return null;
        }

        private cacheContains(name: string): bool { 
            for (var i = 0; i < this._cache.length; i++) { 
                if(this._cache[i] == name)
                    return true;
            }
            return false;
        }

        private install(targetLib: DataSource.Lib, targetVersion: string, libs: DataSource.Lib[]): void { 
            if(this.cacheContains(targetLib.name/* + '@' + targetVersion*/))
                return;

            if (targetLib == null) {
                System.Console.writeLine("   [!] Lib not found.");
            } else {
                var version = targetLib.versions[0];

                System.Web.WebHandler.request.getUrl(version.url, (body) => {
                    this.save(version.url, targetLib.name, version.version, version.key, body);
                    this._cache.push(targetLib.name/* + '@' + version.version*/);

                    if (!this._withDep)
                        return;

                    var deps = (<DataSource.LibDep[]>targetLib.versions[0].dependencies) || [];
                    for (var i = 0; i < deps.length; i++) {
                        var dep: DataSource.Lib = this.find(deps[i].name, libs);
                        this.install(dep, dep.versions[0].version, libs);
                    }
                });
            }
        }

        public exec(args: Array): void {
            var targetLib: DataSource.Lib;

            if (args[2].indexOf('*') != -1) {
                this._withDep = true;
            }

            var tryInstall = (libs, lib: string) => {
                targetLib = this.find(lib, libs);

                if (targetLib)
                    this.install(targetLib, targetLib.versions[0].version, libs);
                else
                    System.Console.writeLine("   [!] Lib not found.");
            };

            this.dataSource.all((libs) => {
                var index = 3;
                var lib = args[index];
                while (lib) {
                    tryInstall(libs, lib);
                    index++;
                    lib = args[index];
                }
            });
        }
    }
}