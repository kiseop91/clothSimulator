// libdeflate compatibility layer using zlib (provided by Emscripten)
#include "libdeflate.h"
#include <zlib.h>
#include <cstdlib>

struct libdeflate_decompressor {
    int dummy;
};

LIBDEFLATEAPI struct libdeflate_decompressor *
libdeflate_alloc_decompressor(void) {
    return (struct libdeflate_decompressor*)calloc(1, sizeof(struct libdeflate_decompressor));
}

LIBDEFLATEAPI enum libdeflate_result
libdeflate_deflate_decompress(struct libdeflate_decompressor *decompressor,
                              const void *in, size_t in_nbytes,
                              void *out, size_t out_nbytes_avail,
                              size_t *actual_out_nbytes_ret) {
    (void)decompressor;

    z_stream strm = {};
    strm.next_in = (Bytef*)in;
    strm.avail_in = (uInt)in_nbytes;
    strm.next_out = (Bytef*)out;
    strm.avail_out = (uInt)out_nbytes_avail;

    // -15 for raw deflate (no zlib/gzip header)
    if (inflateInit2(&strm, -15) != Z_OK)
        return LIBDEFLATE_BAD_DATA;

    int ret = inflate(&strm, Z_FINISH);
    size_t actual = strm.total_out;
    inflateEnd(&strm);

    if (actual_out_nbytes_ret)
        *actual_out_nbytes_ret = actual;

    if (ret == Z_STREAM_END)
        return LIBDEFLATE_SUCCESS;
    if (ret == Z_OK || ret == Z_BUF_ERROR)
        return LIBDEFLATE_INSUFFICIENT_SPACE;
    return LIBDEFLATE_BAD_DATA;
}

LIBDEFLATEAPI void
libdeflate_free_decompressor(struct libdeflate_decompressor *decompressor) {
    free(decompressor);
}
