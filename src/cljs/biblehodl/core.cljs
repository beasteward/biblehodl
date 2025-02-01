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
   [biblehodl.manager :as mgr]
   [biblehodl.subs-manager :as sbm]
   [biblehodl.extension :as ext]
   [biblehodl.nostr :as nostr]
   [cljs.pprint :refer [pprint print-table]]
   [cljs.core.async :as async :refer [<! >! put! chan close! mult tap]]
   [cljs.core.async.interop :refer-macros [<p!]]
   [mount.core :as mount])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(def >evt rf/dispatch)

(def default-relays {"wss://relay.nostr.band" {:read true :write true}
                     "wss://nos.lol" {:read true :write true}
                     "wss://relay.damus.io" {:read true :write true}
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
  {:login-state :logged-out
   :mentions {}
   :relays {:list default-relays
            :updated-at 0}})

(def router
  (rtf/router
   (app-routes)
   {:data {:coercion reitit-spec/coercion}}))

(defn store-get [pubkey]
  (js->clj (.parse js/JSON (.getItem (.-localStorage js/window) pubkey))))

(defn store-save [db pubkey]
  (.setItem (.-localStorage js/window) pubkey (.stringify js/JSON (clj->js db))))

(defn set-or-clear-local [key val]
  (if val
    (.setItem (.-localStorage js/window) key val)
    (.removeItem (.-localStorage js/window) key)))

(defn write-session-pubkey [pubkey private-key]
  (set-or-clear-local "user-pubkey" pubkey)
  (set-or-clear-local "user-private-key" private-key))

;; Event Handlers (effects)

(rf/reg-event-fx
 :app/initialize
 [(inject-cofx :session-pubkey)]
 (fn [cofx _]
   (.log js/console "Initialize...")
   (if-let [pubkey (:user-pubkey cofx)]
     {:db (-> (assoc default-db :user-pubkey pubkey)
              (assoc :private-key (:private-key cofx))
              (assoc :login-state :logging-in)
              (assoc :session/loading? true))
      :dispatch [:reload-session]}
     {:db default-db
      :dispatch [:start-new-session]})))

(rf/reg-event-fx
 :start-new-session
 (fn [cofx _]
   {:fx [[:base-subscriptions-start]
         [:connect-relays (-> cofx :db :relays :list)]]}))

(rf/reg-event-fx
 :relays-connected
 (pprint "relays connected")
 (fn [cofx [_ conns]]
   (pprint ["Connected relays: " conns])
   (if-let [pubkey (-> cofx :db :user-pubkey)] ;; TODO what if pubkey and not private key or extension?
     (if-let [private-key (-> cofx :db :private-key)]
       {:fx  [[:get-relay-recommendations conns]
              [:dispatch [:logged-in-with-pubkey (-> cofx :db :user-pubkey)]]]} ;; have private key => already logged in
       {:fx  [[:get-relay-recommendations conns]
              [:dispatch [:connect-extension]]]})
     {:get-relay-recommendations conns})))

(rf/reg-event-fx
 :reload-session
 [(inject-cofx :local-store-relay-list) (inject-cofx :local-store-contact-list) (inject-cofx :local-store-mentions)]
 (fn [cofx _]
   (pprint "Reloading session with stored pubkey")
   (let [relays-unkw (:relay-list cofx)
         kw1 (zipmap (map keyword (keys relays-unkw)) (vals relays-unkw))
         saved-relays (update-in kw1 [:list] #(zipmap (keys %) (clojure.walk/keywordize-keys (vals %))))
         relays (if (empty? saved-relays) (-> cofx :db :relays) saved-relays)]
     (pprint (-> cofx :db :user-pubkey))
     {:db (-> (assoc (:db cofx) :relays relays)
              (assoc :mentions (zipmap (keys (:mentions cofx)) (clojure.walk/keywordize-keys (vals (:mentions cofx))))))
      :fx [[:base-subscriptions-start]
           [:connect-relays (:list relays)]]})))

(rf/reg-event-fx
 :connect-extension
 (fn [coef _]
   (go
     (let [result (<! (ext/call-extension #(.getPublicKey (.-nostr js/window))))]
       (pprint ["nostr key" result])
       (if (:result result)
         (>evt [:logged-in-with-pubkey (:result result)])
         (>evt [:login-failure (:error result)]))))
   {:db (assoc (:db coef) :login-state :logging-in)}))

;; triggered after the login has been created, or loaded from private key or extension
(rf/reg-event-fx
 :logged-in-with-pubkey
 [(inject-cofx :local-store-contact-list)]
 (fn [cofx [_ pubkey]]
   (pprint {:logged-in pubkey})
   {:db (-> (:db cofx)
            (assoc :user-pubkey pubkey)
            (assoc :login-state :logged-in))
    :fx [[:set-session-pubkey [pubkey (-> cofx :db :private-key)]]
         [:register-user-subscriptions {:pubkey pubkey :contact-list (:contact-list cofx)}]]}))

;; Event Handlers (app-db)

(rf/reg-event-db
 :router/navigated
 (fn [db [_ new-match]]
   (assoc db :router/current-route new-match)))

(rf/reg-event-db
 :login-failure
 (fn [db [_ err]]
   (pprint {:login-fail err})
   (assoc db :login-state :logged-out)))

;; Coeffects

;; TODO - Need to check value of 'user-pubkey' not just presence of key.  Bug when key exists but no value
(rf/reg-cofx
 :session-pubkey
 (fn [coeffects _]
   (-> (assoc coeffects :user-pubkey (.getItem (.-localStorage js/window) "user-pubkey"))
       (assoc :private-key (.getItem (.-localStorage js/window) "user-private-key")))))

(rf/reg-cofx
 :local-store-contact-list
 (fn [coeffects]
   (let [pubkey (get-in coeffects [:db :user-pubkey])
         contact-list (-> (store-get pubkey)
                          (get "contact-list")
                          clojure.walk/keywordize-keys)]
     (assoc coeffects :contact-list contact-list))))

(rf/reg-cofx
 :local-store-relay-list
 (fn [coeffects]
   (let [pubkey (get-in coeffects [:db :user-pubkey])
         relay-list (-> (store-get pubkey)
                        (get "relay-list"))]
     (assoc coeffects :relay-list relay-list))))

(rf/reg-cofx
 :local-store-mentions
 (fn [coeffects]
   (let [pubkey (get-in coeffects [:db :user-pubkey])
         mentions (-> (store-get pubkey)
                      (get "mentions"))]
     (assoc coeffects :mentions mentions))))

;; Effects

(rf/reg-fx
 :connect-relays
 (fn [relays]
   (pprint ["Relays to connect" relays])
   (go
     (let [conn-promises (for [relay relays] (mgr/connect (first relay) (second relay)
                                                          {:on-disconnect sbm/handle-disconnect
                                                           :on-connect sbm/handle-connect}))
           conns (<! (async/map vector conn-promises))]
       (>evt [:relays-connected conns])))))

(rf/reg-fx
 :set-session-pubkey
 (fn [[pubkey private-key]]
   (write-session-pubkey pubkey private-key)))

;; Subcriptions

(rf/reg-sub
 :router/current-route
 (fn [db]
   (:router/current-route db)))

(def events-q (chan))

(go-loop []
  (let [[event key] (<! events-q)
        hashed-event (<! (nostr/->js event))
        signed-event (if key
                       (<! (nostr/->js (<! (nostr/sign event key))))
                       (try (<p! (.signEvent (.-nostr js/window) hashed-event))
                            (catch js/Error e (pprint {:err e :hashed-event hashed-event}))))]
    ;; (pprint {:event signed-event})
    (mgr/write-to-relays #js["EVENT" signed-event])
    (recur)))

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

(defn title-bar []
  (fn []
    [:div {:class "flex min-h-12 border-b border-zinc-300 bg-gray-200 w-full"}
     [:div {:class "flex"}
      [:button {:class "flex flex-col items-center justify-center min-w-20 hover:text-indigo-600"}
       [:span {:class "material-icons"} "apps"]]
      [:button
       [:img {:src "/img/transparent_logo.png" :class "max-h-12 max-w-12"}]]]]))

(defn menu []
  (fn []
    [:nav {:class "max-w-20 bg-gray-200 border-r border-zinc-300 p-0 h-full"}
     [:ul {:class "flex flex-col items-center"}
      [:li {:class "flex justify-center text-center w-full hover:bg-zinc-50"}
       [:button {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-600"}
        [:span {:class "text-zinc-600 material-icons"} "chat_bubble_outline"]
        [:span {:class "text-xs text-zinc-600"} "Chat"]]]
      [:li {:class "flex justify-center text-center w-full hover:bg-zinc-50"}
       [:button {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-600"}
        [:span {:class "text-zinc-600 material-icons"} "dynamic_feed"]
        [:span {:class "text-xs text-zinc-600"} "Feed"]]]
      [:li {:class "flex justify-center text-center w-full hover:bg-zinc-50"}
       [:button {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-600"}
        [:span {:class "text-zinc-600 material-icons"} "groups"]
        [:span {:class "text-xs text-zinc-600"} "Groups"]]]
      [:li {:class "flex justify-center text-center w-full hover:bg-zinc-50"}
       [:button {:class "flex flex-col items-center px-5 py-4 hover:text-indigo-600"}
        [:span {:class "text-zinc-600 material-icons"} "perm_contact_calendar"]
        [:span {:class "text-xs text-zinc-600"} "Calendar"]]]]]));

(defn page [{{:keys [view name]} :data
             path                :path
             :as                 match}]
  [:div {:class "bg-zinc-50 h-full w-full"}
   (if view
     [view match]
     [:div "No view specified for route: " name " (" path ")"])])

(defn app []
  (let [current-route @(rf/subscribe [:router/current-route])]
    [:div {:id "container" :class "flex flex-col h-full"}
     [title-bar]
     [:div {:class "flex h-full"}
      [menu]
      [page current-route]]]))

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