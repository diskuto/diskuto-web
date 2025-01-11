Diskuto-Web
===========

Diskuto-Web is a web front-end to the Diskuto protocol.

Goals
-----

* Complete separation from the Diskuto API, which is in a separate repository.
* Server-side rendering for all the things. This gives quick initial loads, great SEO, and a better experience for people on limited devices.
  (However, we're using Preact, so we can use things client-side as well as needed.)
* Users' private keys are never sent to the server.
* Users can opt in to a "logged-in" view that presents data tailored to them.
* Configurable for easy use with other servers.
* I hope this is easy to clone and modify, so that people can fork and experiment with their own views of the Diskuto social network!

Status
------

Diskuto is the new name for the protocol backing [FeoBlog]. Part of [the project] to rename FeoBlog includes rewriting the UI. This is that UI!
It's currently experimental, but nearing the point at which I'm going to deprecate the old UI and make this the default.

[the project]: https://github.com/orgs/diskuto/projects/1/views/1


Usage From Source
-----------------

* Clone this repo.
* Copy [`diskuto-web.sample.toml`] to `diskuto-web.toml` and update it as needed.
* Run `deno task build`
* Run `deno task start`

[`diskuto-web.sample.toml`]: ./diskuto-web.sample.toml

Usage from JSR
--------------

TODO: Once this is published to JSR, we can skip the `clone` and `build` steps and just run the code directly.