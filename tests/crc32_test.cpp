// SPDX-License-Identifier: GPL-2.0-or-later

#include "utils/ccrc32.h"

#include <cstdio>
#include <cstring>

namespace {

bool expect(const char *name, unsigned int actual, unsigned int expected)
{
    if (actual == expected) {
        return true;
    }

    std::fprintf(stderr, "%s: expected %08x, got %08x\n", name, expected,
                 actual);
    return false;
}

}  // namespace

int main()
{
    CCRC32 crc32;
    bool passed = true;

    const unsigned char standardVector[] = "123456789";
    passed &= expect("standard vector",
                     crc32.FullCRC(standardVector,
                                   std::strlen(
                                       reinterpret_cast<const char *>(
                                           standardVector))),
                     0xcbf43926U);

    passed &= expect("empty input", crc32.FullCRC(NULL, 0), 0x00000000U);

    unsigned int incremental = 0xffffffffU;
    crc32.PartialCRC(&incremental, standardVector, 4);
    crc32.PartialCRC(&incremental, standardVector + 4, 5);
    passed &= expect("incremental input", incremental ^ 0xffffffffU,
                     0xcbf43926U);

    return passed ? 0 : 1;
}

