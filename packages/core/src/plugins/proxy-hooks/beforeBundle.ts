import { PluginAPI, PackagerContext } from "../../../types";
import { verifyExtensions } from "packager-shared";

export default (plugin: PluginAPI, context: PackagerContext) => {
    const canBeBeforeBundled = verifyExtensions(plugin.extensions);
    const checkIfFileIsAlreadyTranspiler = (path: string) =>
        context.transpileQueue.completed.find(f => f.path === path);

    const beforeBundleFunction = async (code: string, moduleId: string) => {
        if (!canBeBeforeBundled(moduleId)) return null;

        const file = checkIfFileIsAlreadyTranspiler(moduleId);

        if (file) {
            return {
                code: file.code,
                map: file.map || { mappings: "" }
            };
        }

        return { code, map: { mappings: "" } };
    };

    return new Proxy(beforeBundleFunction, {
        async apply(target, thisArg, argumentsList) {
            const handledTransformFunction = await Reflect.apply(
                target,
                context,
                argumentsList
            );

            if (!handledTransformFunction) {
                return Promise.resolve();
            }

            const { code, map } = handledTransformFunction;

            return {
                code: (await plugin.beforeBundle!.bind(context)(code)) || code,
                map
            };
        }
    });
};