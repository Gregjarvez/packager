import { InputOptions, OutputOptions, RollupBuild, RollupCache } from "rollup";
import merge from "deepmerge";

import pluginFactory from "packager/setup/plugin-factory";
import {
    PackagerOptions,
    BundleOptions,
    File,
    PluginAPI
} from "packager/types";
import {
    loadRollup,
    loadMagicString,
    findEntryFile,
    extractPackageJsonOptions,
    handleBuildWarnings
} from "packager/setup/utils";
import { createPlugin, createPluginManager } from "packager/core/plugins";
// @ts-ignore
import VueTranspiler from "packager/transpilers/vue";
const pluginManager = createPluginManager();
/**
 * DEMO ONLY
 */
const vuePlugin = createPlugin({
    name: "vue-plugin",
    transpiler: VueTranspiler,
    extensions: [".vue"]
});
const testPlugin = createPlugin({
    name: "test-plugin",
    extensions: [".vue"],
    async loader(moduleId: string) {
        const file = this.files.find(f => f.path === moduleId);

        if (file) {
            return {
                code: file.code
            };
        }
    }
});
export default class Packager {
    public rollup: any;
    public files = <File[]>[];
    public inputOptions: InputOptions;
    public outputOptions: OutputOptions;
    public cachedBundle = <RollupCache>{ modules: [] };

    constructor(
        options: PackagerOptions,
        inputOptions: InputOptions = {},
        outputOptions: OutputOptions = {}
    ) {
        this.inputOptions = {
            ...inputOptions,
            inlineDynamicImports: true,
            cache: this.cachedBundle
        };

        this.outputOptions = {
            ...outputOptions,
            format: "iife",
            sourcemap: options && options.sourcemaps ? "inline" : false,
            freeze: false
        };

        this.registerPlugin(vuePlugin);
    }

    registerPlugin(plugin: PluginAPI) {
        pluginManager.registerPlugin(plugin);
        pluginManager.registerPlugin(testPlugin);
    }

    async bundle(files: File[], bundleOptions?: BundleOptions) {
        this.files = files;

        try {
            // @ts-ignore
            if (!this.rollup || !window.rollup) {
                await loadRollup();
                await loadMagicString();
                //@ts-ignore
                this.rollup = window.rollup;
            }

            let entryFile;
            const packageJson = this.files.find(
                f => f.path === "/package.json"
            );

            if (packageJson && packageJson.code != "") {
                const parsed =
                    typeof packageJson.code === "string"
                        ? JSON.parse(packageJson.code)
                        : packageJson.code;

                const pkgBundleOptions = extractPackageJsonOptions(parsed);
                bundleOptions = merge(pkgBundleOptions, bundleOptions || {});

                if (parsed.main) {
                    entryFile = findEntryFile(
                        this.files,
                        parsed.main.startsWith("/")
                            ? parsed.main
                            : `/${parsed.main}`
                    );
                }
            }

            entryFile = entryFile || findEntryFile(this.files);

            this.inputOptions = {
                ...this.inputOptions,
                input: entryFile?.path,
                onwarn: handleBuildWarnings,
                plugins: pluginFactory(this.files, bundleOptions, pluginManager)
            };

            const bundle = await this.rollup.rollup(this.inputOptions);

            this.cachedBundle = bundle.cache;

            const { output } = await bundle.generate(this.outputOptions);

            return {
                code: `${output[0].code} ${
                    this.outputOptions.sourcemap && output[0].map
                        ? ` \n //# sourceMappingURL=${output[0].map.toUrl()}`
                        : ""
                }`
            };
        } catch (e) {
            console.error(e);
        }
    }
}
