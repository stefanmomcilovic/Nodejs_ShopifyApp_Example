import Router from "koa-router";
import { verifyRequest } from "@shopify/koa-shopify-auth";

import { apiController }  from "./../controllers/apiController";

const router = new Router({prefix: "/api"});

router.post("/", verifyRequest({returnHeader: true}), apiController);

export default router;