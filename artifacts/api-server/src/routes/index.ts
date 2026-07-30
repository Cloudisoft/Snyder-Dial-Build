import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import campaignsRouter from "./campaigns";
import leadsRouter from "./leads";
import knowledgeBaseRouter from "./knowledge_base";
import callsRouter from "./calls";
import promptTemplatesRouter from "./prompt_templates";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import vapiSyncRouter from "./vapi-sync";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(campaignsRouter);
router.use(leadsRouter);
router.use(knowledgeBaseRouter);
router.use(callsRouter);
router.use(promptTemplatesRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(vapiSyncRouter);
router.use(webhooksRouter);

export default router;
