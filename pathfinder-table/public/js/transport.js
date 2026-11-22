// Picks the server transport (api.js) or the hosted one (cloud.js).
import * as server from "./api.js";
import * as cloud from "./cloud.js";
import { MODE } from "./ui.js";

const T = MODE === "artifact" ? cloud : server;
export const session = T.session;
export const canPrint = T.canPrint;
export const init = (...a) => T.init(...a);
export const createGame = (...a) => T.createGame(...a);
export const gameInfo = (...a) => T.gameInfo(...a);
export const joinGame = (...a) => T.joinGame(...a);
export const config = (...a) => T.config(...a);
export const act = (...a) => T.act(...a);
export const askAI = (...a) => T.askAI(...a);
export const enter = (...a) => T.enter(...a);
export const connect = (...a) => T.connect(...a);
export const shareInfo = (...a) => T.shareInfo(...a);
export const exportGame = (...a) => T.exportGame(...a);
export const myGames = (...a) => T.myGames(...a);
export const forget = (...a) => T.forget(...a);
export const onError = (fn) => T.onError && T.onError(fn);
export const onWaitingForGM = (fn) => T.onWaitingForGM && T.onWaitingForGM(fn);
export const isArtifact = MODE === "artifact";
