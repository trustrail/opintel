#include <node_api.h>
#include <cstdint>

// Test-only: establish the actual allocation range independently of the scan.
static napi_value address(napi_env env, napi_callback_info info) {
  size_t argc = 1, size = 0;
  napi_value buffer, result;
  void* data = nullptr;
  napi_get_cb_info(env, info, &argc, &buffer, nullptr, nullptr);
  if (argc != 1 || napi_get_buffer_info(env, buffer, &data, &size) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Expected a Buffer");
    return nullptr;
  }
  napi_create_bigint_uint64(env, reinterpret_cast<uintptr_t>(data), &result);
  return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "address", NAPI_AUTO_LENGTH, address, nullptr, &fn);
  napi_set_named_property(env, exports, "address", fn);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
