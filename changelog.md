# Changelog

## [1.5.0](https://github.com/ehmpathy/simple-async-tasks/compare/v1.4.4...v1.5.0) (2024-07-06)


### Features

* **requeue:** add native sqs requeue capability to prevent error logs on retryLater ([ca83c9b](https://github.com/ehmpathy/simple-async-tasks/commit/ca83c9bf167aa9177bcb3a7ecde0c4f6c1ee7e3e))

## [1.4.4](https://github.com/ehmpathy/simple-async-tasks/compare/v1.4.3...v1.4.4) (2024-06-29)


### Bug Fixes

* **logs:** improve log observability ([48a6bbc](https://github.com/ehmpathy/simple-async-tasks/commit/48a6bbcd6913b80310bc2ff34e300422bd3efb5c))

## [1.4.3](https://github.com/ehmpathy/simple-async-tasks/compare/v1.4.2...v1.4.3) (2024-06-14)


### Bug Fixes

* **enqueue:** support input type which extends unique key ([816f060](https://github.com/ehmpathy/simple-async-tasks/commit/816f06025aa9cdf42d13bcbad04381e4186cdcd6))

## [1.4.2](https://github.com/ehmpathy/simple-async-tasks/compare/v1.4.1...v1.4.2) (2024-06-07)


### Bug Fixes

* **dobj:** support updatedAt as Date or iso String ([1bd381d](https://github.com/ehmpathy/simple-async-tasks/commit/1bd381d1babf898f8381b9fc45dcdd85018d2838))

## [1.4.1](https://github.com/ehmpathy/simple-async-tasks/compare/v1.4.0...v1.4.1) (2024-05-28)


### Bug Fixes

* **deps:** remove unused dep ([87b6db1](https://github.com/ehmpathy/simple-async-tasks/commit/87b6db16a339fed6128af39139e1f561ddebb358))

## [1.4.0](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.5...v1.4.0) (2024-05-28)


### Features

* **mutex:** support mutex lock retries via dobj class statics ([23b923e](https://github.com/ehmpathy/simple-async-tasks/commit/23b923e92d563d44a504631dd73a245aceb72a48))

## [1.3.5](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.4...v1.3.5) (2024-05-17)


### Bug Fixes

* **types:** support procedure.input,.context args pattern ([0204a8b](https://github.com/ehmpathy/simple-async-tasks/commit/0204a8bd926203155c9838e4672dd3357d79a847))

## [1.3.4](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.3...v1.3.4) (2024-05-14)


### Bug Fixes

* **deps:** unpin typefns peer dep with new v sempher range ([#14](https://github.com/ehmpathy/simple-async-tasks/issues/14)) ([87af9f8](https://github.com/ehmpathy/simple-async-tasks/commit/87af9f87c4da750202967fc0af6082cd110fe84e))

## [1.3.3](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.2...v1.3.3) (2024-05-14)


### Bug Fixes

* **deps:** unpin typefns peer dependency ([#12](https://github.com/ehmpathy/simple-async-tasks/issues/12)) ([acbdece](https://github.com/ehmpathy/simple-async-tasks/commit/acbdece8db49d1e68f7992368215073b88829c6b))

## [1.3.2](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.1...v1.3.2) (2024-04-20)


### Bug Fixes

* **enqueue:** re-enable enqueue to any queue, beyond sqs ([495141c](https://github.com/ehmpathy/simple-async-tasks/commit/495141c8218b616ff81b4b02c6073aa37eb7fbab))
* **execute:** enable custom attempt timeout in seconds ([af67c8c](https://github.com/ehmpathy/simple-async-tasks/commit/af67c8c628939e429394357ee0940b7536bb2e1e))

## [1.3.1](https://github.com/ehmpathy/simple-async-tasks/compare/v1.3.0...v1.3.1) (2024-03-15)


### Bug Fixes

* **queue:** allow queue url defined via async fn ([c8ecfe1](https://github.com/ehmpathy/simple-async-tasks/commit/c8ecfe1e2c2e703a78550f81b25b86a8f6507a78))

## [1.3.0](https://github.com/ehmpathy/simple-async-tasks/compare/v1.2.0...v1.3.0) (2024-03-15)


### Features

* **extract:** simplify extracting tasks from sqs events ([75a6891](https://github.com/ehmpathy/simple-async-tasks/commit/75a6891dc8cd794908ed3dd36b6f046f41a340ea))

## [1.2.0](https://github.com/ehmpathy/simple-async-tasks/compare/v1.1.1...v1.2.0) (2024-03-15)


### Features

* **observability:** add logs. only warn on redundant attempts ([#7](https://github.com/ehmpathy/simple-async-tasks/issues/7)) ([45f74c6](https://github.com/ehmpathy/simple-async-tasks/commit/45f74c69f9cdfd7bbee09a0c14173edfd8f0b9db))

## [1.1.1](https://github.com/ehmpathy/simple-async-tasks/compare/v1.1.0...v1.1.1) (2023-07-16)


### Bug Fixes

* **pkg:** make type-fns a peer dep ([b417a50](https://github.com/ehmpathy/simple-async-tasks/commit/b417a5074fa5454b5c81461e466e5b0d5bda1f23))

## [1.1.0](https://github.com/ehmpathy/simple-async-tasks/compare/v1.0.0...v1.1.0) (2023-07-16)


### Features

* **init:** initialize based on simple-localstorage-cache ([dd78966](https://github.com/ehmpathy/simple-async-tasks/commit/dd7896652a1314cc70b8f3825c646e45df1f4420))


### Bug Fixes

* **deploy:** bump to overcome ghost npm version ([db154a7](https://github.com/ehmpathy/simple-async-tasks/commit/db154a7919633893e085ee694ad343cd4fb8fdaa))
* **deploy:** bump to overcome ghost release version ([83293d6](https://github.com/ehmpathy/simple-async-tasks/commit/83293d664c4cf453a77e5a464e94ac5e5f308e4b))

## 1.0.0 (2023-07-16)


### Features

* **init:** initialize based on simple-localstorage-cache ([dd78966](https://github.com/ehmpathy/simple-async-tasks/commit/dd7896652a1314cc70b8f3825c646e45df1f4420))

## 1.0.0 (2023-07-16)


### Features

* **init:** initialize based on simple-localstorage-cache ([dd78966](https://github.com/ehmpathy/simple-async-tasks/commit/dd7896652a1314cc70b8f3825c646e45df1f4420))
