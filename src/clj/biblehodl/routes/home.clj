(ns biblehodl.routes.home
  (:require
   [biblehodl.layout :as layout]
   [biblehodl.db.core :as db]
   [clojure.java.io :as io]
   [biblehodl.middleware :as middleware]
   [ring.util.response]
   [ring.util.http-response :as response]))

(defn home-page [request]
  (layout/render request "home.html" {:docs (-> "docs/docs.md" io/resource slurp)}))

(defn home-routes []
  [""
   {:middleware [middleware/wrap-csrf
                 middleware/wrap-formats]}
   ["/" {:get home-page}]])

