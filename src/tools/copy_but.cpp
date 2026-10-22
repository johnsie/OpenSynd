// SPDX-License-Identifier: GPL-2.0-or-later

#include <cerrno>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <string>

#include <dirent.h>
#include <sys/stat.h>

namespace {

bool makeDirectory(const std::string &path)
{
    return mkdir(path.c_str(), 0755) == 0 || errno == EEXIST;
}

bool copyFile(const std::string &source, const std::string &destination)
{
    std::ifstream input(source.c_str(), std::ios::in | std::ios::binary);
    std::ofstream output(destination.c_str(), std::ios::out | std::ios::binary);
    if (!input || !output) {
        return false;
    }

    char buffer[8192];
    while (input) {
        input.read(buffer, sizeof(buffer));
        output.write(buffer, input.gcount());
    }
    return input.eof() && output.good();
}

bool copyDirectory(const std::string &source, const std::string &destination,
                   const std::string &excludedName)
{
    DIR *directory = opendir(source.c_str());
    if (directory == NULL) {
        std::fprintf(stderr, "Unable to open source directory '%s'.\n",
                     source.c_str());
        return false;
    }

    bool succeeded = makeDirectory(destination);
    struct dirent *entry;
    while (succeeded && (entry = readdir(directory)) != NULL) {
        const std::string name(entry->d_name);
        if (name == "." || name == ".." || name == excludedName) {
            continue;
        }

        const std::string sourcePath = source + "/" + name;
        const std::string destinationPath = destination + "/" + name;
        struct stat details;
        if (lstat(sourcePath.c_str(), &details) != 0) {
            std::fprintf(stderr, "Unable to inspect '%s'.\n", sourcePath.c_str());
            succeeded = false;
        } else if (S_ISDIR(details.st_mode)) {
            succeeded = copyDirectory(sourcePath, destinationPath, excludedName);
        } else if (S_ISREG(details.st_mode)) {
            succeeded = copyFile(sourcePath, destinationPath);
        } else {
            std::fprintf(stderr, "Unsupported resource type '%s'.\n",
                         sourcePath.c_str());
            succeeded = false;
        }
    }

    closedir(directory);
    return succeeded;
}

}  // namespace

int main(int argc, char **argv)
{
    if (argc != 4) {
        std::fprintf(stderr, "Usage: copy_but <source> <destination> <excluded-name>\n");
        return 1;
    }

    return copyDirectory(argv[1], argv[2], argv[3]) ? 0 : 1;
}
