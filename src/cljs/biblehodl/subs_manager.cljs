(ns biblehodl.subs-manager
  (:require
   [reagent.core :as r]
   [re-frame.core :as rf]
   [biblehodl.manager :as mgr]
   [biblehodl.utils :as utils]
   [cljs.core.async :as async :refer [<! >! put! chan close! mult tap]]
   [cljs.pprint :refer [pprint cl-format]])
  (:require-macros [cljs.core.async.macros :refer [go go-loop]]))

(def >evt rf/dispatch)

(def subs-atom (r/atom {}))

(def note-q (chan 100))
(def note-q-mult (async/mult note-q))
(def metadata-q (chan 100))
(def metadata-q-mult (async/mult metadata-q))

(def big-input-pipe (chan 200 (utils/distinct-by :id)))

(def mix (async/mix big-input-pipe))

(defn register-sub [^Subscription s]
  (swap! subs-atom #(assoc % (:id s) s)))

(rf/reg-fx
 :base-subscriptions-start
 (fn []
   (pprint "Create global sub")
   (let [global (mgr/->IndefiniteSub "global" #js{"kinds" #js[0 1 7] "limit" 100})]
     (pprint ["Global Sub Obj: " global])
     (register-sub global))))

(rf/reg-fx
 :register-user-subscriptions
 (fn [{:keys [pubkey contact-list]}]
   (let [authors (clj->js (conj (map :pubkey contact-list) pubkey))
         reqs [(mgr/->IndefiniteSub "mentions/pms" #js{"kinds" #js[1 4] "#p" #js[pubkey] "limit" 100})
               (mgr/->IndefiniteSub "own-pms" #js{"kinds" #js[4] "authors" #js[pubkey] "limit" 100})
               (mgr/->IndefiniteSub "contact-meta" #js{"kinds" #js[0 3] "authors" authors  "limit" 100})]]
     (doseq [req reqs]
       (let [out (mgr/subscribe-multi req)]
         (swap! subs-atom #(assoc % (:id req) req))
         (async/admix mix out))))))

(rf/reg-fx
 :get-relay-recommendations
 (fn [conns]
   (go
     (let [relay-req (mgr/->Request "relayrecs" #js{"kinds" #js[2] "limit" 20})
           data-ch (mgr/subscribe-multi conns relay-req)]
       (loop []
         (when-let [evt (<! data-ch)]
           (>evt [:recommend-relay-msg evt])
           (recur)))))))

(defn start-sub [conn ^Subscription s]
  (let [out (mgr/start-subscription conn s)]
    (async/admix mix out)))

(defn stop-sub [^Subscription s]
  (swap! subs-atom #(dissoc % (:id s))))

(defn batch-subs [conn]
  (let [metabatch (fn [ids] (mgr/->Request "metabatch" #js{"kinds" #js[0] "authors" (clj->js (vec ids)) "limit" 50}))
        notebatch (fn [ids] (mgr/->Request "notebatch" #js{"kinds" #js[1] "ids" (clj->js (vec ids)) "limit" 50}))]
    (go (let [{:keys [in out]} (mgr/subscribe-batch conn metabatch)]
          (async/tap metadata-q-mult in)
          ;; TODO replace with pipe to big input?
          (loop []
            (let [m (<! out)]
              (when m
                (>evt [:metadata-msg m])
                (recur))))
          (async/untap metadata-q-mult in))
        (pprint ["metabatch ended on" conn]))
    (go (let [{:keys [in out]} (mgr/subscribe-batch conn notebatch)]
          (async/tap note-q-mult in)
          (loop []
            (let [m (<! out)]
              (when m
                (>evt [:text-note m])
                (recur))))
          (async/untap note-q-mult in))
        (pprint ["notebatch ended on" conn]))))

(defn handle-connect [conn-p]
  (go (let [conn (<! conn-p)]
        (pprint {:connecting conn})
        (doseq [s @subs-atom]
          (start-sub conn (second s)))
        ;; start batches
        (batch-subs conn))))

(defn handle-disconnect [socket-id]
  :biblehodl.manager/reconnect)