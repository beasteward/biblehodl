(ns biblehodl.core
  (:require
   [reagent.core :as r]
   [reagent.dom :as dom]
   [re-frame.core :as rf :refer [inject-cofx]]
   [reitit.coercion.spec :as reitit-spec]
   [reitit.frontend :as rtf]
   [reitit.frontend.easy :as rtfe]
   [reitit.frontend.controllers :as rtfc]
   [biblehodl.routes.app :refer [app-routes]]
   [cljs.pprint :refer [pprint print-table]]
   [cljs.core.async :as async :refer [<! >! put! chan close! mult tap]]

   [mount.core :as mount])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(def default-relays {"wss://relay.nostr.band" {:read true :write true}
                     "wss://nos.lol" {:read true :write true}
                     "wwss://relay.damus.io" {:read true :write true}
                     "wss://nostr.bitcoiner.social" {:read true :write true}
                     "wss://nostr21.com/" {:read true :write true}
                     "wss://relay.nostrify.io/" {:read true :write true}
                     "wss://offchain.pub" {:read true :write true}
                     "wss://relay.current.fyi" {:read true :write true}
                     "wss://nostr.shroomslab.net" {:read true :write true}
                     "wss://relayable.org" {:read true :write true}
                     "wss://nostr.thank.eu" {:read true :write true}
                     "wss://nostr-pub.wellorder.net" {:read true :write true}})

(def default-db
  {:relays {:list default-relays
            :updated-at 0}})

(def router
  (rtf/router
   (app-routes)
   {:data {:coercion reitit-spec/coercion}}))

(rf/reg-event-fx
 :app/initialize
 (fn [_ _]
   (.log js/console "Initialize...")))

(rf/reg-event-db
 :router/navigated
 (fn [db [_ new-match]]
   (assoc db :router/current-route new-match)))

(rf/reg-sub
 :router/current-route
 (fn [db]
   (:router/current-route db)))

(defn init-routes! []
  (rtfe/start!
   router
   (fn [new-match]
     (when new-match
       (let [{controllers :controllers}
             @(rf/subscribe [:router/current-route])

             new-match-with-controllers
             (assoc new-match
                    :controllers
                    (rtfc/apply-controllers controllers new-match))]
         (rf/dispatch [:router/navigated new-match-with-controllers]))))
   {:use-fragment false}))

(defn menu []
  (fn []
    [:nav {:class "bg-slate-100 p-0"}
     [:aside
      [:ul {:class "flex flex-col items-center"}
       [:li {:class "text-center w-full hover:bg-white"}
        [:a {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-700"}
         [:span.material-icons "chat_bubble_outline"]
         [:span "Chat"]]]
       [:li {:class "text-center w-full hover:bg-white"}
        [:a {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-700"}
         [:span.material-icons "dynamic_feed"]
         [:span "Feed"]]]
       [:li {:class "text-center w-full hover:bg-white"}
        [:a {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-700"}
         [:span.material-icons "groups"]
         [:span "Groups"]]]
       [:li {:class "text-center w-full hover:bg-white"}
        [:a {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-700"}
         [:span.material-icons "perm_contact_calendar"]
         [:span "Calendar"]]]]]]));

(defn page [{{:keys [view name]} :data
             path                :path
             :as                 match}]
  [:div
   (if view
     [view match]
     [:div "No view specified for route: " name " (" path ")"])])

(defn app []
  (let [current-route @(rf/subscribe [:router/current-route])]
    [:<>
     [menu]
     [page current-route]
     [:div "Right Panel"]]))

(defn ^:dev/after-load mount-components []
  (rf/clear-subscription-cache!)
  (.log js/console "Mounting Components...")
  (init-routes!)
  (dom/render [#'app] (.getElementById js/document "content"))
  (.log js/console "Components Mounted!"))

;
(defn init! []
  (.log js/console "Initializing App...")
  (mount/start)
  (rf/dispatch-sync [:app/initialize])
  (mount-components))