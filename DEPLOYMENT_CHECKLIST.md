# Backend Deployment Checklist

Use this checklist to ensure proper deployment of the OxSig backend.

## Pre-Deployment

### Environment Setup
- [ ] Clone repository
- [ ] Install Docker and Docker Compose
- [ ] Install required tools (make, git, etc.)
- [ ] Copy `.env.example` to `.env`
- [ ] Generate secure secrets
- [ ] Update all passwords in `.env`
- [ ] Configure domain name (if applicable)
- [ ] Set up DNS records

### Security Configuration
- [ ] Generate strong passwords for all services
- [ ] Create encryption keys
- [ ] Update TURN server external IP
- [ ] Configure JWT secret
- [ ] Review OPA policies
- [ ] Set up secrets management (Vault/SOPS)
- [ ] Configure firewall rules

### Infrastructure
- [ ] Ensure sufficient resources (4GB+ RAM, 2+ CPU cores)
- [ ] Allocate disk space (50GB+ recommended)
- [ ] Configure backup storage
- [ ] Set up monitoring alerts
- [ ] Configure log retention

## Deployment Steps

### Initial Deployment
- [ ] Run `make setup` or `.\backend.ps1 setup`
- [ ] Review and edit `.env` file
- [ ] Build Docker images: `make build`
- [ ] Start services: `make start`
- [ ] Check service status: `make status`
- [ ] Run database migrations: `make migrate`
- [ ] Verify health checks pass

### Service Verification
- [ ] PostgreSQL is accessible and healthy
- [ ] Redis is responding
- [ ] NATS is connected
- [ ] MinIO API is accessible
- [ ] Meilisearch is running
- [ ] WebSocket Gateway is responding
- [ ] Caddy is proxying correctly
- [ ] Coturn is configured

### Monitoring Setup
- [ ] Access Grafana (http://localhost:3001)
- [ ] Change Grafana admin password
- [ ] Verify Prometheus data sources
- [ ] Import dashboards
- [ ] Configure alerting rules
- [ ] Set up alert channels (email, Slack, etc.)
- [ ] Test alert notifications
- [ ] Configure Uptime Kuma

### Backup Configuration
- [ ] Test database backup: `make backup-db`
- [ ] Test MinIO backup
- [ ] Set up automated backup cron jobs
- [ ] Configure off-site backup storage
- [ ] Test restore procedure
- [ ] Document backup locations
- [ ] Set retention policies

### Security Hardening
- [ ] Run security scan: `make security-scan`
- [ ] Review scan results
- [ ] Update vulnerable packages
- [ ] Enable firewall
- [ ] Configure rate limiting
- [ ] Enable HTTPS/TLS
- [ ] Review access logs
- [ ] Set up intrusion detection

## Post-Deployment

### Testing
- [ ] Test WebSocket connections
- [ ] Verify WebRTC signaling
- [ ] Test database operations
- [ ] Check file upload/download
- [ ] Test search functionality
- [ ] Verify authentication flows
- [ ] Test room creation/joining
- [ ] Check consent recording

### Performance
- [ ] Check response times
- [ ] Monitor resource usage
- [ ] Review connection pools
- [ ] Optimize query performance
- [ ] Configure caching
- [ ] Set up CDN (if needed)
- [ ] Load test endpoints

### Documentation
- [ ] Document deployment process
- [ ] Create runbook for common issues
- [ ] Document backup/restore procedures
- [ ] Create troubleshooting guide
- [ ] Document environment variables
- [ ] Update architecture diagrams
- [ ] Create operational procedures

### Maintenance
- [ ] Set up automated updates
- [ ] Schedule maintenance windows
- [ ] Configure log rotation
- [ ] Set up monitoring alerts
- [ ] Create incident response plan
- [ ] Document escalation procedures
- [ ] Schedule regular security audits

## Production Readiness

### High Availability
- [ ] Configure database replication
- [ ] Set up load balancing
- [ ] Implement health checks
- [ ] Configure auto-restart policies
- [ ] Set up failover procedures
- [ ] Test disaster recovery

### Compliance
- [ ] Review data retention policies
- [ ] Configure audit logging
- [ ] Implement consent tracking
- [ ] Set up data export procedures
- [ ] Document GDPR compliance
- [ ] Configure privacy settings

### Monitoring & Alerting
- [ ] CPU usage alerts configured
- [ ] Memory usage alerts configured
- [ ] Disk space alerts configured
- [ ] Database connection alerts
- [ ] Service health alerts
- [ ] Security alerts configured
- [ ] Backup failure alerts

## Ongoing Operations

### Daily Checks
- [ ] Review service status
- [ ] Check error logs
- [ ] Verify backups completed
- [ ] Monitor resource usage
- [ ] Review security alerts

### Weekly Tasks
- [ ] Review monitoring dashboards
- [ ] Analyze performance metrics
- [ ] Check for security updates
- [ ] Review audit logs
- [ ] Test backup restores

### Monthly Tasks
- [ ] Update dependencies
- [ ] Review and rotate logs
- [ ] Audit user access
- [ ] Review security policies
- [ ] Update documentation
- [ ] Conduct security scan

### Quarterly Tasks
- [ ] Disaster recovery test
- [ ] Security audit
- [ ] Performance review
- [ ] Capacity planning
- [ ] Update procedures

## Rollback Plan

### Preparation
- [ ] Document current state
- [ ] Create system snapshot
- [ ] Backup databases
- [ ] Save configuration files
- [ ] Note service versions

### If Issues Occur
- [ ] Stop new services
- [ ] Check logs for errors
- [ ] Restore from backup if needed
- [ ] Rollback to previous version
- [ ] Verify services after rollback
- [ ] Document incident
- [ ] Review what went wrong

## Support Contacts

### Internal Team
- DevOps Lead: _______________
- Backend Lead: _______________
- Security Team: _______________
- On-Call: _______________

### External Vendors
- Hosting Provider: _______________
- DNS Provider: _______________
- SSL Certificate: _______________
- Support Contracts: _______________

## Sign-Off

Deployment completed by: _______________ Date: _______________

Reviewed by: _______________ Date: _______________

Production approved by: _______________ Date: _______________

---

## Quick Reference

**Start Services**: `make start` or `.\backend.ps1 start`
**Check Status**: `make status` or `.\backend.ps1 status`
**View Logs**: `make logs` or `.\backend.ps1 logs`
**Backup Database**: `make backup-db` or `.\backend.ps1 backup-db`
**Security Scan**: `make security-scan`

**Emergency Contacts**: See SUPPORT.md
**Runbook**: See backend/DEPLOYMENT.md
**Documentation**: See backend/README.md
