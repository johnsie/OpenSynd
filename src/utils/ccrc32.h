// SPDX-License-Identifier: GPL-2.0-or-later

#ifndef FREESYND_UTILS_CCRC32_H
#define FREESYND_UTILS_CCRC32_H

#include <cstddef>

// Compatibility wrapper for the CRC-32 API used by the legacy data checker.
// This implementation uses the reflected CRC-32/ISO-HDLC polynomial.
class CCRC32 {
public:
    CCRC32();
    ~CCRC32();

    void Initialize();

    bool FileCRC(const char *fileName, unsigned int *outCrc,
                 std::size_t bufferSize);
    unsigned int FullCRC(const unsigned char *data, std::size_t dataLength);
    void FullCRC(const unsigned char *data, std::size_t dataLength,
                 unsigned int *outCrc);
    void PartialCRC(unsigned int *crc, const unsigned char *data,
                    std::size_t dataLength);

private:
    unsigned int table_[256];
};

#endif
