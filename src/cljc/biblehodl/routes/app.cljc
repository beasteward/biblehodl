(ns biblehodl.routes.app
  (:require
   [spec-tools.data-spec :as ds]
   #?@(:clj [[biblehodl.layout :as layout]
             [biblehodl.middleware :as middleware]]
       :cljs [[biblehodl.views.home :as home]])))

#?(:clj
   (defn home-page [request]
     (layout/render
      request
      "home.html")))

;
(defn app-routes []
  [""
   #?(:clj {:middleware [middleware/wrap-csrf]
            :get home-page})
   ;
   ;; require [spec-tools.data-spec :as ds]

   ["/"
    (merge
     {:name ::home}
     #?(:cljs
        {:parameters {:query {(ds/opt :post) pos-int?}}
         ;:controllers home/home-controllers
         :view #'home/home}))]])