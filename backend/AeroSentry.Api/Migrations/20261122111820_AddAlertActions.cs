using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122111820_AddAlertActions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "AlertActions",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                AlertId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Action = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                FromStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                ToStatus = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                ByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ByName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                ByRole = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                AtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_AlertActions", x => x.Id);
                table.ForeignKey(
                    name: "FK_AlertActions_Alerts_AlertId",
                    column: x => x.AlertId,
                    principalTable: "Alerts",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_AlertActions_AlertId_AtUtc",
            table: "AlertActions",
            columns: new[] { "AlertId", "AtUtc" });
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "AlertActions");
    }
}
