// SPDX-License-Identifier: GPL-2.0-or-later

#include "ccrc32.h"

#include <cstdio>
#include <new>

namespace {

const unsigned int kInitialCrc = 0xffffffffU;
const unsigned int kReflectedPolynomial = 0xedb88320U;

}  // namespace

CCRC32::CCRC32()
{
    Initialize();
}

CCRC32::~CCRC32()
{
}

void CCRC32::Initialize()
{
    for (unsigned int value = 0; value < 256; ++value) {
        unsigned int remainder = value;
        for (int bit = 0; bit < 8; ++bit) {
            if ((remainder & 1U) != 0) {
                remainder = (remainder >> 1) ^ kReflectedPolynomial;
            } else {
                remainder >>= 1;
            }
        }
        table_[value] = remainder;
    }
}

void CCRC32::PartialCRC(unsigned int *crc, const unsigned char *data,
                        std::size_t dataLength)
{
    if (crc == NULL || (data == NULL && dataLength != 0)) {
        return;
    }

    for (std::size_t index = 0; index < dataLength; ++index) {
        const unsigned int tableIndex = (*crc ^ data[index]) & 0xffU;
        *crc = (*crc >> 8) ^ table_[tableIndex];
    }
}

void CCRC32::FullCRC(const unsigned char *data, std::size_t dataLength,
                     unsigned int *outCrc)
{
    if (outCrc == NULL) {
        return;
    }

    *outCrc = kInitialCrc;
    PartialCRC(outCrc, data, dataLength);
    *outCrc ^= kInitialCrc;
}

unsigned int CCRC32::FullCRC(const unsigned char *data,
                             std::size_t dataLength)
{
    unsigned int crc = 0;
    FullCRC(data, dataLength, &crc);
    return crc;
}

bool CCRC32::FileCRC(const char *fileName, unsigned int *outCrc,
                     std::size_t bufferSize)
{
    if (fileName == NULL || outCrc == NULL || bufferSize == 0) {
        return false;
    }

    std::FILE *source = std::fopen(fileName, "rb");
    if (source == NULL) {
        return false;
    }

    unsigned char *buffer = new (std::nothrow) unsigned char[bufferSize];
    if (buffer == NULL) {
        std::fclose(source);
        return false;
    }

    unsigned int crc = kInitialCrc;
    std::size_t bytesRead = 0;
    while ((bytesRead = std::fread(buffer, 1, bufferSize, source)) != 0) {
        PartialCRC(&crc, buffer, bytesRead);
    }

    const bool succeeded = std::ferror(source) == 0;
    delete[] buffer;
    std::fclose(source);

    if (!succeeded) {
        return false;
    }

    *outCrc = crc ^ kInitialCrc;
    return true;
}
