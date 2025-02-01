(defproject biblehodl "0.1.0-SNAPSHOT"

  :description "FIXME: write description"
  :url "http://example.com/FIXME"

  :dependencies [[ch.qos.logback/logback-classic "1.4.4"]
                 [clojure.java-time "1.1.0"]
                 ;
                 [org.postgresql/postgresql "42.3.2"]
                 ;
                 [buddy "2.0.0"]
                 ;
                 [com.taoensso/sente "1.19.2"]
                 ;
                 [conman "0.9.5"]
                 [cprop "0.1.19"]
                 [expound "0.9.0"]
                 [funcool/struct "1.4.0"]
                 [haslett "0.1.7"]
                 [com.lambdaisland/deja-fu "1.3.51"]
                 [luminus-http-kit "0.2.0"]
                 [luminus-migrations "0.7.5"]
                 [luminus-transit "0.1.5"]
                 [luminus/ring-ttl-session "0.3.3"]
                 [markdown-clj "1.11.3"]
                 [metosin/muuntaja "0.6.8"]
                 [metosin/jsonista "0.3.1"]
                 [metosin/reitit "0.5.18"]
                 [metosin/ring-http-response "0.9.3"]
                 [metosin/ring-swagger-ui "2.2.10"]
                 [mount "0.1.16"]
                 [nrepl "1.0.0"]
                 ;
                 [cljs-ajax "0.8.4"]
                 [org.clojure/clojurescript "1.11.60" :scope "provided"]
                 [reagent "1.1.1"]
                 [re-frame "1.2.0"]
                 [com.google.javascript/closure-compiler-unshaded "v20220803" :scope "provided"]
                 [org.clojure/google-closure-library "0.0-20191016-6ae1f72f" :scope "provided"]
                 [thheller/shadow-cljs "2.20.3" :scope "provided"]
                 ;
                 [org.clojure/core.async "1.6.681"]
                 [org.clojure/clojure "1.11.1"]
                 [org.clojure/tools.cli "1.0.214"]
                 [org.clojure/tools.logging "1.2.4"]
                 [org.webjars.npm/material-icons "1.13.2"]
                 [org.webjars/webjars-locator "0.45"]
                 [ring-webjars "0.2.0"]
                 [ring/ring-core "1.9.6"]
                 [ring/ring-defaults "0.3.4"]
                 [selmer "1.12.55"]]

  :min-lein-version "2.0.0"

  :source-paths ["src/clj" "src/cljs" "src/cljc"]
  :test-paths ["test/clj"]
  :resource-paths ["resources" "target/cljsbuild"]
  :target-path "target/%s/"
  :main ^:skip-aot biblehodl.core

  :plugins []
  :clean-targets ^{:protect false} [:target-path "target/cljsbuild" ".shadow-cljs"]

  :profiles
  {:uberjar {:omit-source true
             :aot :all
             :uberjar-name "biblehodl.jar"
             :source-paths ["env/prod/clj" "env/prod/cljc" "env/prod/cljs"]
             :prep-tasks ["compile"
                          ["run" "-m" "shadow.cljs.devtools.cli" "release" "app"]]
             :resource-paths ["env/prod/resources"]}

   :dev           [:project/dev :profiles/dev]
   :test          [:project/dev :project/test :profiles/test]

   :project/dev  {:jvm-opts ["-Dconf=dev-config.edn"]
                  :dependencies [[binaryage/devtools "1.0.6"] ;; cljs-devtools
                                 [day8.re-frame/re-frame-10x "1.0.2"] ;; [day8.re-frame/re-frame-10x "0.7.0"] threw an npm install error
                                 [pjstadig/humane-test-output "0.11.0"]
                                 [prone "2021-04-23"]
                                 [ring/ring-devel "1.9.6"]
                                 [ring/ring-mock "0.4.0"]]
                  :plugins      [[com.jakemccrary/lein-test-refresh "0.24.1"]
                                 [jonase/eastwood "1.2.4"]]

                  :source-paths ["env/dev/clj" "env/dev/cljc" "env/dev/cljs"]
                  :resource-paths ["env/dev/resources"]
                  :repl-options {:init-ns user
                                 :timeout 120000}
                  :injections [(require 'pjstadig.humane-test-output)
                               (pjstadig.humane-test-output/activate!)]}
   :project/test {:jvm-opts ["-Dconf=test-config.edn"]
                  :resource-paths ["env/test/resources"]}
   :profiles/dev {}
   :profiles/test {}})

; Potential uberjar error on specific Java versions: https://aphyr.com/posts/369-classnotfoundexception-java-util-sequencedcollection
; It turns out that the Clojure compiler, when run on JDK 21 or later, will automatically insert references to this class
; It was an issue when using Java v1.8.0.  Upgraded to Java 17 instead of latest due to potential issue with latest versions.

;
;
; JAVA VERSION - 17.0.11
; JDK VERSION - OpenJDK 22
;
;
