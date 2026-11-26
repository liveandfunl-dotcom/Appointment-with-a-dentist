// jsdom не предоставляет TextEncoder/TextDecoder, а react-router использует их при импорте.
import { TextDecoder, TextEncoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });
