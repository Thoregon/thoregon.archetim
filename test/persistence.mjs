/**
 *
 *
 * @author: Bernhard Lukassen
 * @licence: MIT
 * @see: {@link https://github.com/Thoregon}
 */

import BO             from "./items/bo.mjs";
import ThoregonEntity from "../lib/thoregonentity.mjs";

const a = new BO();
a.a = 'A';
const b = new BO();
a.b = b;

const bo = ThoregonEntity.create({ instance: a });
