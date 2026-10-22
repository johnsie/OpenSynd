/* SPDX-License-Identifier: GPL-2.0-or-later */

#include <stdio.h>

int main(int argc, char **argv)
{
    FILE *input;
    FILE *output;
    unsigned long size = 0;
    int byte;

    if (argc != 4) {
        fprintf(stderr, "Usage: embed <input> <name> <output>\n");
        return 1;
    }

    input = fopen(argv[1], "rb");
    if (input == NULL) {
        fprintf(stderr, "Unable to open '%s' for input.\n", argv[1]);
        return 1;
    }

    output = fopen(argv[3], "wb");
    if (output == NULL) {
        fprintf(stderr, "Unable to open '%s' for output.\n", argv[3]);
        fclose(input);
        return 1;
    }

    fprintf(output, "#pragma once\n");
    fprintf(output, "const unsigned char %s_data[] = {\n", argv[2]);
    while ((byte = fgetc(input)) != EOF) {
        fprintf(output, "0x%02x, ", (unsigned int)(unsigned char)byte);
        ++size;
        if ((size % 16UL) == 0) {
            fputc('\n', output);
        }
    }
    if ((size % 16UL) != 0) {
        fputc('\n', output);
    }
    fprintf(output, "};\n");
    fprintf(output, "const unsigned long %s_size = %lu;\n", argv[2], size);

    if (ferror(input) || ferror(output) || fclose(output) != 0) {
        fprintf(stderr, "Unable to embed '%s'.\n", argv[1]);
        fclose(input);
        return 1;
    }

    fclose(input);
    return 0;
}
