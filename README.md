[![JSR Version]][JSR Link]

Diskuto-Web
===========

Diskuto-Web is a web front-end for the [Diskuto] protocol.

Goals
-----

* Complete separation from the [Diskuto API].
* Server-side rendering for reading content.  
  This gives quick initial loads, great SEO, and a better experience for people on limited devices.
* Users' private keys are never sent to the server.
* I hope this is easy to clone and modify, so that people can fork and experiment with their own views of the Diskuto social network!

[Diskuto]: https://github.com/diskuto/
[Diskuto API]: https://github.com/diskuto/diskuto-api/


Usage From Source
-----------------

* Clone this repo.
* Copy [`diskuto-web.sample.toml`] to `diskuto-web.toml` and update it as needed.
* Run `deno task build`
* Run `deno task start`

[`diskuto-web.sample.toml`]: ./diskuto-web.sample.toml

Usage from JSR
--------------

 * Create a `diskuto-web.toml` following the format from [`diskuto-web.sample.toml`].
 * `deno run -RNE jsr:@diskuto/web start`



[JSR Version]: https://jsr.io/badges/@diskuto/web
[JSR Link]: https://jsr.io/@diskuto/web