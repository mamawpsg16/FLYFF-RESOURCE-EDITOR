// The C++ the GM Commands page reads, from the fixtures (test-data/fixtures/src, tools/refresh-fixtures.sh), keyed like io/source-read.js
import { readBytes } from './gjs-env.js';
export function gmCpp(root) {
  const src = root + '/test-data/fixtures/src/', t = p => new TextDecoder('latin1').decode(readBytes(src + p));
  return new Map([['functextcmd.cpp', t('FuncTextCmd.cpp')], ['customcommon.h', t('CustomCommon.h')],
    ['worldserver/versioncommon.h', t('worldserver/VersionCommon.h')], ['neuz/versioncommon.h', t('neuz/VersionCommon.h')]]);
}
