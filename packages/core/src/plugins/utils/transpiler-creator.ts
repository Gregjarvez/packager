import {
  PluginTranspiler,
  TranspilerContext,
  File,
  PluginContext
} from "../../../types";

export const TRANSPILE_STATUS = {
  PREPARE_FILES: "TRANSPILER:FILE:PREPARE",
  PREPARE_ADDITIONAL: "TRANSPILER:ADDITIONAL:PREPARE",
  ADDITIONAL_TRANSPILED: "TRANSPILER:ADDITIONAL:TRANSPILED",
  TRANSPILE_COMPLETE: "TRANSPILER:TRANSPILE:COMPLETE",
  ERROR_COMPILE: "TRANSPILER:ERROR:COMPILE",
  ERROR_ADDITIONAL: "TRANSPILER:ERROR:ADDITIONAL"
};

const validateOptions = (options: PluginTranspiler) => {
  if (!options.worker) {
    throw new Error("Every transpiler requires a worker.");
  }

  if (
    (options.dependencies && !Array.isArray(options.dependencies)) ||
    (options.dependencies &&
      Array.isArray(options.dependencies) &&
      options.dependencies.length === 0)
  ) {
    throw new Error("'Dependencies' has to be an array with string values.");
  }
};

const validateContext = (context: PluginContext) => {
  const transpiler = context.meta.get("transpiler");

  if (
    !transpiler!.extensions ||
    (transpiler!.extensions && !Array.isArray(transpiler!.extensions)) ||
    (transpiler!.extensions &&
      Array.isArray(transpiler!.extensions) &&
      !transpiler!.extensions.length)
  ) {
    throw new Error(
      `Plugin ${context.name} has to have extensions when using a transpiler.`
    );
  }
};

export const createTranspiler = (
  options: PluginTranspiler,
  context: PluginContext
): TranspilerContext => {
  validateOptions(options);
  validateContext(context);

  return {
    context,
    setContext(context: PluginContext): void {
      this.context = context;
    },
    worker: options.worker(),
    extensions: context.meta.get("transpiler").extensions,
    transpile(file: File) {
      return new Promise((resolve, reject) => {
        this.worker.onmessage = async ({ data }) => {
          const { file, type, error, additional } = data;

          if (
            type === TRANSPILE_STATUS.ERROR_ADDITIONAL ||
            type === TRANSPILE_STATUS.ERROR_COMPILE
          ) {
            return reject(error);
          }

          if (type === TRANSPILE_STATUS.PREPARE_ADDITIONAL) {
            try {
              const additionalTranspiled = await this.transpileAdditional(
                additional
              );

              this.worker.postMessage({
                type: TRANSPILE_STATUS.ADDITIONAL_TRANSPILED,
                file,
                additional: additionalTranspiled,
                context: {
                  files: this.context.packagerContext.files
                }
              });
            } catch (error) {
              return reject(error);
            }
          }

          if (type === TRANSPILE_STATUS.TRANSPILE_COMPLETE) {
            return resolve(file);
          }
        };

        this.worker.postMessage({
          type: TRANSPILE_STATUS.PREPARE_FILES,
          file,
          context: {
            files: this.context.packagerContext.files
          }
        });
      });
    },
    async transpileAdditional({
      styles,
      html
    }: {
      styles: any[];
      html: any[];
    }) {
      const completedStyles: any = [];
      for (const style of styles) {
        const { code, path, name, extension } = style;
        if (!extension || extension === "") {
          console.error(
            `Could not recognise which file type or language to load for ${path}`
          );
          throw new Error(
            `Could not recognise which file type or language to load for ${path}`
          );
        }

        const transpiler = this.getDependencyTranspiler(extension);
        if (transpiler) {
          completedStyles.push(transpiler.transpile({ name, code, path }));
        }
      }

      return {
        styles: await Promise.all(completedStyles)
      };
    },
    getDependencyTranspiler(extension: string): TranspilerContext | null {
      extension = extension.startsWith(".") ? extension : `.${extension}`;

      const transpilers: TranspilerContext[] = Object.values(
        this.context.packagerContext.transpilers.getAll()
      );
      let transpiler = transpilers.find(t => t.extensions.includes(extension));

      /**
       * If we have already used this transpiler somewhere else,
       * we can use it here too.
       */
      if (transpiler) {
        let pluginContext = {
          ...transpiler.context,
          packagerContext: this.context.packagerContext
        };

        transpiler.setContext(pluginContext);
        return transpiler;
      }

      const foundPlugin = this.context.packagerContext.plugins.find(p => {
        const transpiler = p.meta.get("transpiler");
        if (transpiler) {
          return transpiler.extensions.includes(extension);
        }
        return false;
      });

      /**
       * Checking whether any of the registered plugins actually
       * support this extension.
       */
      if (foundPlugin && foundPlugin.rawPlugin.transpiler) {
        let pluginContext: PluginContext = {
          ...foundPlugin,
          packagerContext: this.context.packagerContext
        };
        transpiler = createTranspiler(
          foundPlugin.rawPlugin.transpiler,
          pluginContext
        );

        this.context.packagerContext.transpilers.set(
          `${foundPlugin.name}-transpiler`,
          transpiler
        );
        pluginContext.packagerContext = this.context.packagerContext;
        transpiler.setContext(pluginContext);

        return transpiler;
      }

      console.error(
        `Extension ${extension} is not supported. Please register a plugin that supports it.`
      );

      throw new Error(
        `Extension ${extension} is not supported. Please register a plugin that supports it.`
      );
    }
  };
};

export default createTranspiler;
