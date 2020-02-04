import Transpiler from "../transpiler";
// @ts-ignore
import StylusWorker from "web-worker:./stylus-worker.ts";
import { PackagerContext } from "../../plugins";

export default class StylusTranspiler extends Transpiler {
    public additionalTranspilers = {};

    constructor(context: PackagerContext) {
        super("stylus-transpiler", new StylusWorker(), context);
    }

    transpile(file: any) {
        return this.doTranspile(file);
    }
}